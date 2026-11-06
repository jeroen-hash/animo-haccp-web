import Stripe from "npm:stripe@^22";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Alleen POST-verzoeken zijn toegestaan." }, 405);
    }

    const stripeSecretKey = (Deno.env.get("STRIPE_SECRET_KEY") ?? "").trim();
    const appUrl = Deno.env.get("APP_URL");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    // Log alleen het type prefix; nooit de geheime sleutel zelf.
    const stripeKeyPrefix = stripeSecretKey.slice(0, 3);
    console.log("Stripe key prefix:", stripeKeyPrefix || "(leeg)");

    if (!stripeSecretKey || !appUrl || !supabaseUrl || !supabaseAnonKey) {
      throw new Error("Een of meerdere omgevingsvariabelen ontbreken.");
    }

    if (!stripeSecretKey.startsWith("sk_live_") &&
        !stripeSecretKey.startsWith("sk_test_")) {
      throw new Error(
        "STRIPE_SECRET_KEY bevat geen Stripe secret key (verwacht sk_live_ of sk_test_). Controleer de Supabase-secret met exact die naam."
      );
    }

    const authorization = req.headers.get("Authorization");
    if (!authorization) {
      return jsonResponse({ error: "Je bent niet aangemeld." }, 401);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = authorization.replace(/^Bearer\s+/i, "");
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse({ error: "Je aanmelding is niet meer geldig." }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const requestedBusinessId = String(body?.businessId ?? "");

    // Eigenaar en manager mogen het Stripe-klantenportaal openen.
    const { data: memberships, error: membershipError } = await supabase
      .from("business_members")
      .select("business_id, role")
      .eq("user_id", user.id)
      .eq("active", true)
      .in("role", ["owner", "manager"]);

    if (membershipError) throw membershipError;

    const membership = (memberships ?? []).find((item) =>
      !requestedBusinessId || item.business_id === requestedBusinessId
    );

    if (!membership) {
      return jsonResponse(
        { error: "Alleen een actieve eigenaar of manager kan het klantenportaal openen." },
        403,
      );
    }

    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .select("id, name")
      .eq("id", membership.business_id)
      .maybeSingle();

    if (businessError) throw businessError;

    if (!business) {
      return jsonResponse({ error: "Er werd geen toegankelijke zaak gevonden." }, 404);
    }

    const { data: subscription, error: subscriptionError } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("business_id", business.id)
      .maybeSingle();

    if (subscriptionError) throw subscriptionError;

    if (!subscription?.stripe_customer_id) {
      return jsonResponse(
        { error: "Voor deze zaak bestaat nog geen Stripe-klant." },
        404,
      );
    }

    const stripe = new Stripe(stripeSecretKey);
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: appUrl,
    });

    return jsonResponse({ url: session.url });
  } catch (error) {
    console.error("create-portal-session error:", error);
    return jsonResponse(
      {
        error: error instanceof Error
          ? error.message
          : "Het klantenportaal kon niet worden geopend.",
      },
      500,
    );
  }
});