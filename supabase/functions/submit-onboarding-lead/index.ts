import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function cleanText(value: unknown, maximumLength = 500): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maximumLength);
}

serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      {
        error: "Alleen POST-aanvragen zijn toegestaan.",
      },
      405
    );
  }

  try {
    const body = await request.json();

    const contactName = cleanText(body.contact_name, 120);
    const contactEmail = cleanText(
      body.contact_email,
      180
    ).toLowerCase();

    const contactPhone =
      cleanText(body.contact_phone, 40) || null;

    const businessName = cleanText(body.business_name, 160);

    const enterpriseNumber =
      cleanText(body.enterprise_number, 40) || null;

    const emailIsValid =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail);

    if (!contactName) {
      return jsonResponse(
        {
          error: "De naam van de contactpersoon ontbreekt.",
        },
        400
      );
    }

    if (!emailIsValid) {
      return jsonResponse(
        {
          error: "Vul een geldig e-mailadres in.",
        },
        400
      );
    }

    if (!businessName) {
      return jsonResponse(
        {
          error: "De naam van de horecazaak ontbreekt.",
        },
        400
      );
    }

    const payload =
      body.payload &&
      typeof body.payload === "object" &&
      !Array.isArray(body.payload)
        ? body.payload
        : {};

    if (payload.consent !== "accepted") {
      return jsonResponse(
        {
          error:
            "Bevestig eerst het akkoord met de voorwaarden en privacyverklaring.",
        },
        400
      );
    }

    // Store an auditable server timestamp and the consent wording version.
    payload.consent = {
      accepted: true,
      version: "2026-11-07",
      accepted_at: new Date().toISOString(),
    };

    const supabaseUrl = Deno.env.get("SUPABASE_URL");

    const serviceRoleKey = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY"
    );

    if (!supabaseUrl || !serviceRoleKey) {
      console.error(
        "De vereiste Supabase-servervariabelen ontbreken."
      );

      return jsonResponse(
        {
          error: "De serverconfiguratie is onvolledig.",
        },
        500
      );
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const { data, error } = await supabase
      .from("onboarding_leads")
      .insert({
        status: "new",
        contact_name: contactName,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        business_name: businessName,
        enterprise_number: enterpriseNumber,
        payload,
      })
      .select(
        "id, submitted_at, upload_token"
      )
      .single();

    if (error) {
      console.error(
        "De onboardingaanvraag kon niet worden opgeslagen:",
        error
      );

      return jsonResponse(
        {
          error: "De aanvraag kon niet worden opgeslagen.",
        },
        500
      );
    }

    return jsonResponse({
      ok: true,
      id: data.id,
      submitted_at: data.submitted_at,
      upload_token: data.upload_token,
    });
  } catch (error) {
    console.error(
      "Onverwachte fout bij de onboardingaanvraag:",
      error
    );

    return jsonResponse(
      {
        error: "De aanvraag kon niet worden verwerkt.",
      },
      500
    );
  }
});