
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function isValidFutureDate(value: string | null) {
  if (!value) return false;

  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp) && timestamp > Date.now();
}

function getAccessDecision(input: any) {
  const now = input.now ?? Date.now();
  const trialStart = input.trialStartedAt
    ? new Date(input.trialStartedAt).getTime()
    : NaN;
  const trialEnd = input.trialEndsAt
    ? new Date(input.trialEndsAt).getTime()
    : NaN;
  const trialActive = Number.isFinite(trialStart) &&
    trialStart <= now && Number.isFinite(trialEnd) && trialEnd > now;
  const trialExpired = Number.isFinite(trialEnd) && trialEnd <= now;
  const subscriptionActive = input.subscriptionStatus === "active" &&
    isValidFutureDate(input.subscriptionPeriodEnd);

  if (input.lifetimeFree) {
    return { accessAllowed: true, accessReason: "lifetime_free", trialActive, trialExpired };
  }
  if (subscriptionActive) {
    return { accessAllowed: true, accessReason: "subscription_active", trialActive, trialExpired };
  }
  if (trialActive) {
    return { accessAllowed: true, accessReason: "trial_active", trialActive, trialExpired };
  }
  if (trialExpired) {
    return { accessAllowed: false, accessReason: "trial_expired", trialActive, trialExpired };
  }
  return { accessAllowed: false, accessReason: "trial_not_started", trialActive, trialExpired };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    if (req.method !== "GET" && req.method !== "POST") {
      return jsonResponse(
        {
          error: "Alleen GET- en POST-verzoeken zijn toegestaan.",
        },
        405,
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new Error(
        "De Supabase-omgevingsvariabelen ontbreken.",
      );
    }

    const authorization = req.headers.get("Authorization");

    if (!authorization) {
      return jsonResponse(
        { error: "Je bent niet aangemeld." },
        401,
      );
    }

    const supabase = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: {
            Authorization: authorization,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const token = authorization.replace(
      /^Bearer\s+/i,
      "",
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse(
        { error: "Je aanmelding is niet meer geldig." },
        401,
      );
    }

    let requestedBusinessId = "";

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      requestedBusinessId = String(
        body?.businessId ?? "",
      ).trim();
    } else {
      const url = new URL(req.url);
      requestedBusinessId =
        url.searchParams.get("businessId") ?? "";
    }

    // Alleen actieve leden mogen de status van een zaak opvragen.
    const {
      data: memberships,
      error: membershipError,
    } = await supabase
      .from("business_members")
      .select("business_id, role, active")
      .eq("user_id", user.id)
      .eq("active", true);

    if (membershipError) {
      throw membershipError;
    }

    if (!memberships || memberships.length === 0) {
      return jsonResponse(
        {
          error: "Je hebt geen actieve horecazaak gekoppeld.",
        },
        404,
      );
    }

    let allowedMemberships = memberships;

    if (requestedBusinessId) {
      allowedMemberships = memberships.filter(
        (membership) =>
          membership.business_id === requestedBusinessId,
      );
    }

    if (allowedMemberships.length === 0) {
      return jsonResponse(
        {
          error: "Je hebt geen toegang tot deze horecazaak.",
        },
        403,
      );
    }

    const businessIds = allowedMemberships.map(
      (membership) => membership.business_id,
    );

    let businessQuery = supabase
      .from("businesses")
      .select(`
        id,
        name,
        owner_user_id,
        trial_started_at,
        trial_ends_at,
        trial_used_at,
        lifetime_free
      `);

    if (requestedBusinessId) {
      businessQuery = businessQuery.eq(
        "id",
        requestedBusinessId,
      );
    } else {
      businessQuery = businessQuery.in(
        "id",
        businessIds,
      );
    }

    const {
      data: business,
      error: businessError,
    } = await businessQuery.limit(1).maybeSingle();

    if (businessError) {
      throw businessError;
    }

    if (!business) {
      return jsonResponse(
        {
          error: "Er werd geen toegankelijke zaak gevonden.",
        },
        404,
      );
    }

    const membership = allowedMemberships.find(
      (item) => item.business_id === business.id,
    );

    if (!membership) {
      return jsonResponse(
        {
          error: "Je hebt geen actieve toegang tot deze zaak.",
        },
        403,
      );
    }

    const role = membership.role;

    // Eigenaar en manager mogen de facturatie beheren.
    const billingAllowed =
      role === "owner" || role === "manager";

    // Billing details are read with service role only after the caller's
    // authenticated membership and business access have been verified above.
    // This lets RLS restrict direct subscription-table reads to owners/managers.
    const supabaseAdmin = createClient(
      supabaseUrl,
      supabaseServiceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    // Abonnement ophalen.
    const {
      data: subscription,
      error: subscriptionError,
    } = await supabaseAdmin
      .from("subscriptions")
      .select(`
        business_id,
        stripe_customer_id,
        stripe_subscription_id,
        stripe_price_id,
        plan,
        status,
        current_period_start,
        current_period_end,
        cancel_at_period_end,
        created_at,
        updated_at
      `)
      .eq("business_id", business.id)
      .maybeSingle();

    if (subscriptionError) {
      throw subscriptionError;
    }

    const now = Date.now();
    const trialStartedAt = business.trial_started_at;
    const trialEndsAt = business.trial_ends_at;
    const trialUsedAt = business.trial_used_at;
    const lifetimeFree = business.lifetime_free === true;

    // Eén centrale beslissing voor proefperiode, abonnement en uitzonderingen.
    const access = getAccessDecision({
      lifetimeFree,
      subscriptionStatus: subscription?.status ?? null,
      subscriptionPeriodEnd: subscription?.current_period_end ?? null,
      trialStartedAt,
      trialEndsAt,
      now,
    });
    const { accessAllowed, accessReason, trialActive, trialExpired } = access;
    const trialEndTimestamp = trialEndsAt ? new Date(trialEndsAt).getTime() : NaN;
    const trialRemainingDays = trialActive
      ? Math.ceil((trialEndTimestamp - now) / 86400000)
      : 0;

    // Stripe-identificatiegegevens alleen beschikbaar maken
    // voor eigenaar en manager.
    const customerId = billingAllowed
      ? subscription?.stripe_customer_id ?? ""
      : "";

    const subscriptionId = billingAllowed
      ? subscription?.stripe_subscription_id ?? ""
      : "";

    const priceId = billingAllowed
      ? subscription?.stripe_price_id ?? ""
      : "";

    return jsonResponse({
      found: !!subscription,

      businessId: business.id,
      businessName: business.name,
      owner: business.owner_user_id === user.id,
      role,

      plan: subscription?.plan ?? "monthly",
      status: subscription?.status ?? "none",

      accessAllowed,
      accessReason,
      billingAllowed,

      lifetimeFree,

      trialStartedAt,
      trialEndsAt,
      trialUsedAt,
      trialActive,
      trialExpired,
      trialRemainingDays,

      customerId,
      subscriptionId,
      priceId,

      currentPeriodStart:
        subscription?.current_period_start ?? null,

      currentPeriodEnd:
        subscription?.current_period_end ?? null,

      cancelAtPeriodEnd:
        subscription?.cancel_at_period_end ?? false,

      createdAt: subscription?.created_at ?? null,
      updatedAt: subscription?.updated_at ?? null,
    });
  } catch (error) {
    console.error("subscription-status error:", error);

    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "De abonnementsstatus kon niet worden opgehaald.",
      },
      500,
    );
  }
});
