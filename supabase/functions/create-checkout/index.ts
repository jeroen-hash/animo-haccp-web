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

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const monthlyPriceId = Deno.env.get("STRIPE_PRICE_MONTHLY");
    const yearlyPriceId = Deno.env.get("STRIPE_PRICE_YEARLY");
    const appUrl = Deno.env.get("APP_URL");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!stripeSecretKey || !monthlyPriceId || !yearlyPriceId ||
        !appUrl || !supabaseUrl || !supabaseAnonKey) {
      throw new Error("Een of meerdere vereiste omgevingsvariabelen ontbreken.");
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
    const plan = body?.plan;
    const requestedBusinessId = String(body?.businessId ?? "").trim();

    if (plan !== "monthly" && plan !== "yearly") {
      return jsonResponse({ error: "Kies monthly of yearly." }, 400);
    }

    // Facturatie is beschikbaar voor actieve eigenaars en managers.
    let membershipQuery = supabase
      .from("business_members")
      .select("business_id, role")
      .eq("user_id", user.id)
      .eq("active", true)
      .in("role", ["owner", "manager"]);

    if (requestedBusinessId) {
      membershipQuery = membershipQuery.eq("business_id", requestedBusinessId);
    }

    const { data: memberships, error: membershipError } =
      await membershipQuery.limit(2);

    if (membershipError) throw membershipError;

    if (!memberships || memberships.length === 0) {
      return jsonResponse({
        error: "Alleen een actieve eigenaar of manager kan een abonnement starten voor deze zaak.",
      }, 403);
    }

    if (memberships.length > 1) {
      return jsonResponse({
        error: "Dit account beheert meerdere zaken. Selecteer eerst de juiste horecazaak.",
      }, 400);
    }

    const membership = memberships[0];

    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .select("id, name")
      .eq("id", membership.business_id)
      .maybeSingle();

    if (businessError) throw businessError;
    if (!business) {
      return jsonResponse({
        error: "Er werd geen toegankelijke zaak gevonden voor dit account.",
      }, 404);
    }

    // Hergebruik de bestaande Stripe-klant en voorkom dubbele actieve abonnementen.
    const { data: existingSubscription, error: subscriptionError } =
      await supabase
        .from("subscriptions")
        .select("stripe_customer_id, stripe_subscription_id, status")
        .eq("business_id", business.id)
        .maybeSingle();

    if (subscriptionError) throw subscriptionError;

    const existingStatus = existingSubscription?.status ?? "";
    const blockingStatuses = [
      "active",
      "trialing",
      "past_due",
      "unpaid",
      "incomplete",
    ];

    if (
      existingSubscription?.stripe_subscription_id &&
      blockingStatuses.includes(existingStatus)
    ) {
      return jsonResponse({
        error: "Voor deze zaak bestaat al een lopend of nog af te handelen abonnement. Gebruik 'Abonnement beheren' om dit te bekijken.",
        code: "subscription_already_exists",
      }, 409);
    }

    const stripe = new Stripe(stripeSecretKey);
    const selectedPriceId = plan === "monthly" ? monthlyPriceId : yearlyPriceId;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
        allow_promotion_codes: true,
      line_items: [{ price: selectedPriceId, quantity: 1 }],
      ...(existingSubscription?.stripe_customer_id
        ? { customer: existingSubscription.stripe_customer_id }
        : { customer_email: user.email ?? undefined }),
      client_reference_id: business.id,
      metadata: {
        user_id: user.id,
        business_id: business.id,
        business_name: business.name ?? "",
        plan,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          business_id: business.id,
          plan,
        },
      },
      success_url: `${appUrl}/?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/?stripe=cancelled`,
    });

    if (!session.url) {
      throw new Error("Stripe heeft geen Checkout-URL teruggestuurd.");
    }

    return jsonResponse({ url: session.url });
  } catch (error) {
    console.error("create-checkout error:", error);
    return jsonResponse({
      error: error instanceof Error
        ? error.message
        : "Onbekende fout bij het starten van Stripe Checkout.",
    }, 500);
  }
});
