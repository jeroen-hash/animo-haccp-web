import Stripe from "npm:stripe@^23";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Alleen POST-verzoeken zijn toegestaan." }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const leadId = typeof body.lead_id === "string" ? body.lead_id.trim() : "";
    const uploadToken = typeof body.upload_token === "string" ? body.upload_token.trim() : "";
    if (!leadId) return jsonResponse({ error: "De aanvraag-ID ontbreekt." }, 400);

    const authorization = req.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !stripeSecretKey) {
      return jsonResponse({ error: "De serverconfiguratie is onvolledig." }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let isPublicCustomerCheckout = false;
    if (uploadToken) {
      const { data: publicLead, error: publicLeadError } = await adminClient
        .from("onboarding_leads")
        .select("id, status, contact_email, business_name, payload, upload_token")
        .eq("id", leadId)
        .single();
      if (publicLeadError || !publicLead || publicLead.upload_token !== uploadToken) {
        return jsonResponse({ error: "De aanvraag kon niet veilig worden geverifieerd." }, 403);
      }
      if (publicLead.status !== "new") {
        return jsonResponse({ error: "Deze aanvraag kan niet meer via de klantbetaalpagina worden betaald." }, 409);
      }
      isPublicCustomerCheckout = true;
    } else {
      if (!token) return jsonResponse({ error: "Je moet als platformbeheerder aangemeld zijn." }, 401);
      const actingClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: authData, error: authError } = await actingClient.auth.getUser(token);
      if (authError || !authData.user) return jsonResponse({ error: "De beheerderssessie is ongeldig of verlopen." }, 401);
      const { data: platformAdmin, error: adminError } = await adminClient
        .from("platform_admins")
        .select("user_id")
        .eq("user_id", authData.user.id)
        .maybeSingle();
      if (adminError) throw adminError;
      if (!platformAdmin) return jsonResponse({ error: "Alleen een platformbeheerder mag een onboardingbetaling aanvragen." }, 403);
    }

    const { data: lead, error: leadError } = await adminClient
      .from("onboarding_leads")
      .select("id, status, contact_email, business_name, payload, upload_token")
      .eq("id", leadId)
      .single();
    if (leadError || !lead) return jsonResponse({ error: "De onboardingaanvraag werd niet gevonden." }, 404);
    if (isPublicCustomerCheckout ? lead.status !== "new" : lead.status !== "approved") {
      return jsonResponse({ error: isPublicCustomerCheckout ? "Deze aanvraag is niet meer beschikbaar voor betaling." : "Keur de onboardingaanvraag eerst goed voordat je de betaling aanvraagt." }, 409);
    }

    const payload = lead.payload && typeof lead.payload === "object" && !Array.isArray(lead.payload)
      ? lead.payload as Record<string, unknown>
      : {};
    const serviceLevel = String(payload.service_level || "");
    const fees: Record<string, { amount: number; name: string; description: string }> = {
      basis: { amount: 7500, name: "ANIMO HACCP – gedeeltelijke onboarding", description: "Eenmalige vergoeding voor gedeeltelijke inrichting door ANIMO. Prijs exclusief btw." },
      begeleid: { amount: 17500, name: "ANIMO HACCP – volledige onboarding", description: "Eenmalige vergoeding voor volledige inrichting door ANIMO. Prijs exclusief btw." },
    };
    const fee = fees[serviceLevel];
    if (!fee) return jsonResponse({ error: "Voor deze aanvraag is geen betalende onboardingdienst geselecteerd." }, 400);
    if (payload.onboarding_payment_required !== true) {
      return jsonResponse({ error: "Deze aanvraag werd niet als betalende onboardingaanvraag geregistreerd." }, 409);
    }

    const payment = payload.onboarding_payment && typeof payload.onboarding_payment === "object"
      ? payload.onboarding_payment as Record<string, unknown>
      : {};
    if (payment.status === "paid") {
      return jsonResponse({ message: "Deze onboardingkost is al betaald.", paid: true });
    }

    const stripe = new Stripe(stripeSecretKey);
    const existingSessionId = typeof payment.checkout_session_id === "string" ? payment.checkout_session_id : "";
    if (existingSessionId) {
      const existingSession = await stripe.checkout.sessions.retrieve(existingSessionId);
      if (existingSession.payment_status === "paid") {
        const paidPayload = {
          ...payload,
          onboarding_payment: {
            ...payment,
            status: "paid",
            paid_at: new Date().toISOString(),
          },
        };
        const { error } = await adminClient.from("onboarding_leads").update({ payload: paidPayload }).eq("id", lead.id);
        if (error) throw error;
        return jsonResponse({ paid: true, message: "De onboardingkost is al betaald." });
      }
      if (existingSession.status === "open" && existingSession.url) {
        return jsonResponse({ url: existingSession.url, reused: true, amount_ex_vat: fee.amount, currency: "eur" });
      }
      if (existingSession.status === "complete" && existingSession.payment_status !== "paid" && payment.status !== "failed") {
        return jsonResponse({ error: "De betaling wordt nog door Stripe verwerkt. Wacht op de bevestiging voordat je een nieuwe betaallink maakt." }, 409);
      }
    }

    const suffix = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map((n) => "abcdefghijklmnopqrstuvwxyz"[n % 26]).join("");
    const appUrl = (Deno.env.get("APP_URL") || "https://app.animo-apps.com").replace(/\/$/, "");
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: String(lead.contact_email || "").trim().toLowerCase(),
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: fee.amount,
          tax_behavior: "exclusive",
          product_data: {
            name: fee.name,
            description: fee.description,
          },
        },
      }],
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      invoice_creation: {
        enabled: true,
        invoice_data: {
          metadata: {
            payment_kind: "onboarding_fee",
            onboarding_lead_id: lead.id,
            service_level: serviceLevel,
          },
        },
      },
      client_reference_id: lead.id,
      metadata: {
        payment_kind: "onboarding_fee",
        onboarding_lead_id: lead.id,
        service_level: serviceLevel,
        business_name: String(lead.business_name || "").slice(0, 500),
      },
      payment_intent_data: {
        metadata: {
          payment_kind: "onboarding_fee",
          onboarding_lead_id: lead.id,
          service_level: serviceLevel,
        },
      },
      integration_identifier: `animo_onboarding_${suffix}`,
      success_url: isPublicCustomerCheckout
        ? `${appUrl}/onboarding-form.html?payment=success`
        : `${appUrl}/onboarding-dashboard.html?onboarding_payment=success&lead_id=${encodeURIComponent(lead.id)}`,
      cancel_url: isPublicCustomerCheckout
        ? `${appUrl}/onboarding-form.html?payment=cancelled`
        : `${appUrl}/onboarding-dashboard.html?onboarding_payment=cancelled&lead_id=${encodeURIComponent(lead.id)}`,
    });

    if (!session.url) throw new Error("Stripe heeft geen betaallink teruggestuurd.");
    const nextPayload = {
      ...payload,
      onboarding_payment: {
        ...payment,
        status: "pending",
        amount_ex_vat: fee.amount,
        currency: "eur",
        service_level: serviceLevel,
        checkout_session_id: session.id,
        checkout_url: session.url,
        created_at: new Date().toISOString(),
        tax_behavior: "exclusive",
      },
    };
    const { error: updateError } = await adminClient
      .from("onboarding_leads")
      .update({ payload: nextPayload })
      .eq("id", lead.id);
    if (updateError) throw updateError;

    return jsonResponse({ url: session.url, amount_ex_vat: fee.amount, currency: "eur" });
  } catch (error) {
    console.error("create-onboarding-payment error:", error);
    return jsonResponse({
      error: error instanceof Error ? error.message : "De onboardingbetaling kon niet worden aangemaakt.",
    }, 500);
  }
});
