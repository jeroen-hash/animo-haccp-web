import Stripe from "npm:stripe@^22";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({
          error: "Alleen POST-verzoeken zijn toegestaan.",
        }),
        {
          status: 405,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const monthlyPriceId = Deno.env.get("STRIPE_PRICE_MONTHLY");
    const yearlyPriceId = Deno.env.get("STRIPE_PRICE_YEARLY");
    const appUrl = Deno.env.get("APP_URL");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (
      !stripeSecretKey ||
      !monthlyPriceId ||
      !yearlyPriceId ||
      !appUrl ||
      !supabaseUrl ||
      !supabaseAnonKey
    ) {
      throw new Error(
        "Een of meerdere vereiste omgevingsvariabelen ontbreken.",
      );
    }

    const authorization = req.headers.get("Authorization");

    if (!authorization) {
      return new Response(
        JSON.stringify({
          error: "Je bent niet aangemeld.",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
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
      },
    );

    const token = authorization.replace("Bearer ", "");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          error: "Je aanmelding is niet meer geldig.",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const body = await req.json();
    const plan = body.plan;

    if (plan !== "monthly" && plan !== "yearly") {
      return new Response(
        JSON.stringify({
          error: "Kies monthly of yearly.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Facturatie is beschikbaar voor actieve eigenaars en managers.
    const { data: membership, error: membershipError } = await supabase
      .from("business_members")
      .select("business_id, role")
      .eq("user_id", user.id)
      .eq("active", true)
      .in("role", ["owner", "manager"])
      .limit(1)
      .maybeSingle();

    if (membershipError) {
      throw membershipError;
    }

    if (!membership) {
      return new Response(
        JSON.stringify({
          error: "Alleen een actieve eigenaar of manager kan een abonnement starten.",
        }),
        {
          status: 403,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .select("id, name")
      .eq("id", membership.business_id)
      .maybeSingle();

    if (businessError) {
      throw businessError;
    }

    if (!business) {
      return new Response(
        JSON.stringify({
          error: "Er werd geen toegankelijke zaak gevonden voor dit account.",
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const stripe = new Stripe(stripeSecretKey);

    const selectedPriceId =
      plan === "monthly"
        ? monthlyPriceId
        : yearlyPriceId;

    const session =
      await stripe.checkout.sessions.create({
        mode: "subscription",

        line_items: [
          {
            price: selectedPriceId,
            quantity: 1,
          },
        ],

        customer_email: user.email,

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

        success_url:
          `${appUrl}/?stripe=success&session_id={CHECKOUT_SESSION_ID}`,

        cancel_url:
          `${appUrl}/?stripe=cancelled`,
      });

    if (!session.url) {
      throw new Error(
        "Stripe heeft geen Checkout-URL teruggestuurd.",
      );
    }

    return new Response(
      JSON.stringify({
        url: session.url,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("create-checkout error:", error);

    return new Response(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "Onbekende fout bij het starten van Stripe Checkout.",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});