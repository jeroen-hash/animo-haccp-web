import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      {
        error: "Alleen POST-verzoeken zijn toegestaan.",
      },
      405,
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");

    const serviceRoleKey = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    );

    const invoiceParserUrl = Deno.env.get(
      "INVOICE_PARSER_URL",
    );

    const invoiceSharedSecret = Deno.env.get(
      "INVOICE_SHARED_SECRET",
    );

    if (
      !supabaseUrl ||
      !serviceRoleKey ||
      !invoiceParserUrl ||
      !invoiceSharedSecret
    ) {
      return jsonResponse(
        {
          error:
            "De serverconfiguratie voor factuurverwerking is niet volledig.",
        },
        500,
      );
    }

    const authorization =
      req.headers.get("Authorization");

    if (
      !authorization?.startsWith("Bearer ")
    ) {
      return jsonResponse(
        {
          error:
            "Je moet aangemeld zijn om een factuur te verwerken.",
        },
        401,
      );
    }

    const accessToken = authorization
      .replace("Bearer ", "")
      .trim();

    const adminClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const {
      data: { user },
      error: userError,
    } = await adminClient.auth.getUser(
      accessToken,
    );

    if (userError || !user) {
      return jsonResponse(
        {
          error:
            "De aanmelding is ongeldig of verlopen.",
        },
        401,
      );
    }

    const body = await req.json();
    const requestedBusinessId = String(body?.businessId ?? "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedBusinessId)) {
      return jsonResponse(
        { error: "De actieve horecazaak ontbreekt of is ongeldig. Meld opnieuw aan en probeer opnieuw." },
        400,
      );
    }

    const {
      data: membership,
      error: membershipError,
    } = await adminClient
      .from("business_members")
      .select("business_id, role, active")
      .eq("business_id", requestedBusinessId)
      .eq("user_id", user.id)
      .eq("active", true)
      .maybeSingle();

    if (membershipError) {
      console.error(
        "Membership error:",
        membershipError,
      );

      return jsonResponse(
        {
          error:
            "De toegang tot de zaak kon niet worden gecontroleerd.",
        },
        500,
      );
    }

    if (!membership) {
      return jsonResponse(
        {
          error:
            "Er is geen actieve zaak aan dit account gekoppeld.",
        },
        403,
      );
    }
    const { data: accessBusiness, error: accessBusinessError } = await adminClient
      .from("businesses")
      .select("trial_started_at, trial_ends_at, lifetime_free")
      .eq("id", membership.business_id)
      .maybeSingle();
    if (accessBusinessError) throw accessBusinessError;

    const { data: accessSubscription, error: accessSubscriptionError } = await adminClient
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("business_id", membership.business_id)
      .maybeSingle();
    if (accessSubscriptionError) throw accessSubscriptionError;

    const now = Date.now();
    const trialAllowed = !!accessBusiness?.trial_started_at &&
      new Date(accessBusiness.trial_started_at).getTime() <= now &&
      !!accessBusiness?.trial_ends_at &&
      new Date(accessBusiness.trial_ends_at).getTime() > now;
    const paidAllowed = accessSubscription?.status === "active" &&
      !!accessSubscription?.current_period_end &&
      new Date(accessSubscription.current_period_end).getTime() > now;

    if (!(accessBusiness?.lifetime_free === true || trialAllowed || paidAllowed)) {
      return jsonResponse(
        { error: "De proefperiode is afgelopen. Activeer eerst een ANIMO HACCP-abonnement." },
        402,
      );
    }


    const fileBase64 = String(
      body?.fileBase64 ??
        body?.imageBase64 ??
        "",
    ).trim();

    const mimeType = String(
      body?.mimeType ?? "",
    )
      .trim()
      .toLowerCase();

    const fileName = String(
      body?.fileName ?? "factuur",
    ).trim();

    if (!fileBase64) {
      return jsonResponse(
        {
          error:
            "Er werd geen factuurbestand ontvangen.",
        },
        400,
      );
    }

    const supportedMimeTypes = [
      "application/pdf",
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/tiff",
    ];

    if (
      !supportedMimeTypes.includes(mimeType)
    ) {
      return jsonResponse(
        {
          error:
            "Gebruik PDF, JPG, PNG, WebP of TIFF.",
        },
        400,
      );
    }

    const parserResponse = await fetch(
      invoiceParserUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-parser-secret":
            invoiceSharedSecret,
        },
        body: JSON.stringify({
          fileBase64,
          mimeType,
          fileName,
        }),
      },
    );

    const responseText =
      await parserResponse.text();

    let parserData: Record<
      string,
      unknown
    >;

    try {
      parserData = responseText
        ? JSON.parse(responseText)
        : {};
    } catch {
      console.error(
        "Cloud Run non-JSON response:",
        responseText,
      );

      return jsonResponse(
        {
          error:
            "De factuurparser gaf een ongeldig antwoord terug.",
        },
        502,
      );
    }

    if (!parserResponse.ok) {
      console.error(
        "Cloud Run parser error:",
        parserResponse.status,
        parserData,
      );

      return jsonResponse(
        {
          error: String(
            parserData?.error ??
              "De factuur kon niet worden verwerkt.",
          ),
        },
        parserResponse.status,
      );
    }

    return jsonResponse({
      ...parserData,
      businessId: membership.business_id,
      processedBy: user.id,
    });
  } catch (error) {
    console.error(
      "Process delivery note error:",
      error,
    );

    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Er is een onverwachte fout opgetreden tijdens de factuurverwerking.",
      },
      500,
    );
  }
});