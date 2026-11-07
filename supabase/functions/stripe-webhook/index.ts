
import Stripe from "npm:stripe@^22";
import { createClient } from "npm:@supabase/supabase-js@2";

const cryptoProvider = Stripe.createSubtleCryptoProvider();

function jsonResponse(
  data: Record<string, unknown>,
  status = 200,
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function stripeDate(timestamp?: number | null) {
  if (timestamp == null) return null;
  return new Date(timestamp * 1000).toISOString();
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const data = invoice as unknown as {
    subscription?: string | { id: string } | null;
    parent?: {
      subscription_details?: {
        subscription?: string | { id: string } | null;
      } | null;
    } | null;
  };

  const subscription =
    data.subscription ??
    data.parent?.subscription_details?.subscription;

  if (typeof subscription === "string") {
    return subscription;
  }

  return subscription?.id ?? null;
}

function shouldIgnoreSubscriptionOverwrite(
  currentSubscriptionId: string | null,
  currentSubscriptionCreated: number | null,
  incomingSubscriptionId: string,
  incomingSubscriptionCreated: number,
) {
  return Boolean(
    currentSubscriptionId &&
    currentSubscriptionId !== incomingSubscriptionId &&
    currentSubscriptionCreated !== null &&
    currentSubscriptionCreated >= incomingSubscriptionCreated
  );
}

async function saveSubscription(
  stripe: Stripe,
  supabaseAdmin: ReturnType<typeof createClient>,
  subscription: Stripe.Subscription,
) {
  const firstItem = subscription.items.data[0];

  const itemPeriods = firstItem as unknown as {
    current_period_start?: number;
    current_period_end?: number;
  };

  const subscriptionPeriods = subscription as unknown as {
    current_period_start?: number;
    current_period_end?: number;
  };

  const periodStart =
    itemPeriods.current_period_start ??
    subscriptionPeriods.current_period_start ??
    subscription.start_date;

  const periodEnd =
    itemPeriods.current_period_end ??
    subscriptionPeriods.current_period_end ??
    null;

  const { data: existing, error: existingError } =
    await supabaseAdmin
      .from("subscriptions")
      .select("business_id, user_id, plan")
      .eq("stripe_subscription_id", subscription.id)
      .maybeSingle();

  if (existingError) throw existingError;

  const businessId =
    subscription.metadata?.business_id ||
    existing?.business_id;

  const userId =
    subscription.metadata?.user_id ||
    existing?.user_id ||
    null;

  let plan =
    subscription.metadata?.plan ||
    existing?.plan ||
    null;

  const monthlyPriceId = Deno.env.get("STRIPE_PRICE_MONTHLY");
  const yearlyPriceId = Deno.env.get("STRIPE_PRICE_YEARLY");
  const currentPriceId = firstItem?.price?.id;

  if (!plan && currentPriceId === monthlyPriceId) {
    plan = "monthly";
  }

  if (!plan && currentPriceId === yearlyPriceId) {
    plan = "yearly";
  }

  if (!businessId) {
    console.error(
      "Geen business_id gevonden voor abonnement:",
      subscription.id,
    );

    throw new Error(
      `Ontbrekende business_id voor Stripe-abonnement ${subscription.id}`,
    );
  }

  // Stripe can deliver subscription events out of order. Since the table
  // stores one subscription per business, an old canceled subscription
  // must never overwrite a newer live subscription row.
  const { data: currentBusinessSubscription, error: currentBusinessSubscriptionError } =
    await supabaseAdmin
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("business_id", businessId)
      .maybeSingle();

  if (currentBusinessSubscriptionError) {
    throw currentBusinessSubscriptionError;
  }

  const currentSubscriptionId =
    currentBusinessSubscription?.stripe_subscription_id ?? null;
  if (
    currentSubscriptionId &&
    currentSubscriptionId !== subscription.id
  ) {
    // Compare Stripe's immutable creation timestamps rather than status.
    // A late event from an older subscription must not revive it after a
    // newer subscription was canceled or replaced.
    const currentStripeSubscription =
      await stripe.subscriptions.retrieve(currentSubscriptionId);

    if (
      shouldIgnoreSubscriptionOverwrite(
        currentSubscriptionId,
        currentStripeSubscription.created,
        subscription.id,
        subscription.created,
      )
    ) {
      console.warn("Verouderd Stripe-event genegeerd; nieuwer abonnement blijft gekoppeld:", {
        business_id: businessId,
        incoming_subscription_id: subscription.id,
        incoming_created: subscription.created,
        current_subscription_id: currentSubscriptionId,
        current_created: currentStripeSubscription.created,
      });
      return;
    }
  }

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? null;

  const { error } = await supabaseAdmin
    .from("subscriptions")
    .upsert(
      {
        business_id: businessId,
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        stripe_price_id: currentPriceId ?? null,
        plan,
        status: subscription.status,
        current_period_start: stripeDate(periodStart),
        current_period_end: stripeDate(periodEnd),
        cancel_at_period_end: subscription.cancel_at_period_end,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "business_id",
      },
    );

  if (error) throw error;

  console.log("Abonnement opgeslagen:", {
    subscription_id: subscription.id,
    business_id: businessId,
    status: subscription.status,
    plan,
  });
}

async function retrieveAndSaveSubscription(
  stripe: Stripe,
  supabaseAdmin: ReturnType<typeof createClient>,
  subscriptionId: string,
) {
  const subscription =
    await stripe.subscriptions.retrieve(subscriptionId);

  await saveSubscription(
    stripe,
    supabaseAdmin,
    subscription,
  );
}

async function logStripeRiskEvent(
  stripe: Stripe,
  supabaseAdmin: ReturnType<typeof createClient>,
  event: Stripe.Event,
  object: Record<string, unknown>,
) {
  let customerId = typeof object.customer === "string"
    ? object.customer
    : (object.customer as { id?: string } | null)?.id ?? null;

  const chargeValue = object.charge;
  const chargeId = typeof chargeValue === "string"
    ? chargeValue
    : (chargeValue as { id?: string } | null)?.id ?? null;

  if (!customerId && chargeId) {
    const charge = await stripe.charges.retrieve(chargeId);
    customerId = typeof charge.customer === "string"
      ? charge.customer
      : charge.customer?.id ?? null;
  }

  if (!customerId) {
    console.warn("Stripe-risico-event zonder klant-ID:", event.id, event.type);
    return;
  }

  const { data: subscription, error: subscriptionError } = await supabaseAdmin
    .from("subscriptions")
    .select("business_id, user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (subscriptionError) throw subscriptionError;
  if (!subscription?.business_id) {
    console.warn("Geen ANIMO-zaak gevonden voor Stripe-risico-event:", event.id);
    return;
  }

  const objectId = typeof object.id === "string" ? object.id : "onbekend";
  const { error } = await supabaseAdmin.from("audit_log").insert({
    business_id: subscription.business_id,
    user_id: subscription.user_id ?? null,
    module: "billing",
    action: event.type.replaceAll(".", "_"),
    details: `Stripe-waarschuwing ${event.type}; event=${event.id}; object=${objectId}. Controleer dit in Stripe.`,
  });
  if (error) throw error;
}

async function saveInvoice(
  supabaseAdmin: ReturnType<typeof createClient>,
  invoice: Stripe.Invoice,
  eventType: string,
) {
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
  let query = supabaseAdmin.from("subscriptions").select("business_id").limit(1);
  if (subscriptionId) query = query.eq("stripe_subscription_id", subscriptionId);
  else if (customerId) query = query.eq("stripe_customer_id", customerId);
  else {
    console.warn("Stripe-factuur zonder klant- of abonnementsreferentie:", invoice.id);
    return;
  }
  const { data: linked, error: linkError } = await query.maybeSingle();
  if (linkError) throw linkError;
  if (!linked?.business_id) {
    console.warn("Geen ANIMO-zaak gevonden voor Stripe-factuur:", invoice.id);
    return;
  }
  const { error } = await supabaseAdmin.from("billing_invoices").upsert({
    business_id: linked.business_id,
    stripe_invoice_id: invoice.id,
    stripe_subscription_id: subscriptionId,
    stripe_customer_id: customerId,
    invoice_number: invoice.number ?? null,
    status: invoice.status ?? "draft",
    currency: String(invoice.currency ?? "eur").toLowerCase(),
    amount_due: invoice.amount_due ?? 0,
    amount_paid: invoice.amount_paid ?? 0,
    amount_remaining: invoice.amount_remaining ?? 0,
    stripe_created_at: stripeDate(invoice.created) ?? new Date().toISOString(),
    due_at: stripeDate(invoice.due_date),
    paid_at: stripeDate(invoice.status_transitions?.paid_at),
    period_start: stripeDate(invoice.period_start),
    period_end: stripeDate(invoice.period_end),
    attempt_count: invoice.attempt_count ?? 0,
    attempted: invoice.attempted ?? false,
    billing_reason: invoice.billing_reason ?? null,
    collection_method: invoice.collection_method ?? null,
    last_event_type: eventType,
    synced_at: new Date().toISOString(),
  }, { onConflict: "stripe_invoice_id" });
  if (error) throw error;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse(
      {
        error: "Alleen POST-verzoeken zijn toegestaan.",
      },
      405,
    );
  }

  const stripeSecretKey =
    Deno.env.get("STRIPE_SECRET_KEY");

  const webhookSecret =
    Deno.env.get("STRIPE_WEBHOOK_SIGNING_SECRET");

  const supabaseUrl =
    Deno.env.get("SUPABASE_URL");

  const supabaseServiceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (
    !stripeSecretKey ||
    !webhookSecret ||
    !supabaseUrl ||
    !supabaseServiceRoleKey
  ) {
    console.error(
      "Een of meerdere vereiste secrets ontbreken.",
    );

    return jsonResponse(
      {
        error: "De serverconfiguratie is onvolledig.",
      },
      500,
    );
  }

  const stripe = new Stripe(stripeSecretKey);

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

  const signature =
    req.headers.get("Stripe-Signature");

  if (!signature) {
    return jsonResponse(
      {
        error: "Stripe-handtekening ontbreekt.",
      },
      400,
    );
  }

  const body = await req.text();

  let event: Stripe.Event;

  try {
    event =
      await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret,
        undefined,
        cryptoProvider,
      );
  } catch (error) {
    console.error(
      "Ongeldige webhook-handtekening:",
      error,
    );

    return jsonResponse(
      {
        error: "Ongeldige Stripe-handtekening.",
      },
      400,
    );
  }

  try {
    console.log("Stripe-event ontvangen:", event.type);

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session =
          event.data.object as Stripe.Checkout.Session;

        const paymentComplete =
          session.payment_status === "paid" ||
          session.payment_status === "no_payment_required";

        if (
          session.mode === "payment" &&
          session.metadata?.payment_kind === "onboarding_fee" &&
          paymentComplete
        ) {
          const leadId = session.metadata.onboarding_lead_id;
          if (!leadId) throw new Error("Onboardingbetaling mist onboarding_lead_id.");

          const { data: lead, error: leadError } = await supabaseAdmin
            .from("onboarding_leads")
            .select("id, payload")
            .eq("id", leadId)
            .maybeSingle();
          if (leadError) throw leadError;
          if (!lead) throw new Error(`Onboardingaanvraag ${leadId} niet gevonden voor betaalde Stripe-sessie.`);

          const payload =
            lead.payload &&
            typeof lead.payload === "object" &&
            !Array.isArray(lead.payload)
              ? lead.payload
              : {};
          const previousPayment =
            payload.onboarding_payment &&
            typeof payload.onboarding_payment === "object"
              ? payload.onboarding_payment
              : {};
          const paymentIntentId =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id ?? null;
          const invoiceId =
            typeof session.invoice === "string"
              ? session.invoice
              : session.invoice?.id ?? null;

          const { error: updateError } = await supabaseAdmin
            .from("onboarding_leads")
            .update({
              payload: {
                ...payload,
                onboarding_payment_required: true,
                onboarding_payment: {
                  ...previousPayment,
                  status: "paid",
                  checkout_session_id: session.id,
                  payment_intent_id: paymentIntentId,
                  invoice_id: invoiceId,
                  amount_paid: session.amount_total ?? 0,
                  amount_tax: session.total_details?.amount_tax ?? 0,
                  currency: String(session.currency ?? "eur").toLowerCase(),
                  paid_at: new Date().toISOString(),
                },
              },
            })
            .eq("id", leadId);
          if (updateError) throw updateError;
          console.log("Eenmalige onboardingbetaling bevestigd:", {
            lead_id: leadId,
            checkout_session_id: session.id,
            amount_paid: session.amount_total ?? 0,
          });
        } else if (
          session.mode === "subscription" &&
          session.subscription &&
          paymentComplete
        ) {
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;

          await retrieveAndSaveSubscription(
            stripe,
            supabaseAdmin,
            subscriptionId,
          );
        }

        break;
      }

      case "checkout.session.async_payment_failed":
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "payment" && session.metadata?.payment_kind === "onboarding_fee") {
          const leadId = session.metadata.onboarding_lead_id;
          if (leadId) {
            const { data: lead, error: leadError } = await supabaseAdmin
              .from("onboarding_leads")
              .select("id, payload")
              .eq("id", leadId)
              .maybeSingle();
            if (leadError) throw leadError;
            if (lead) {
              const payload =
                lead.payload &&
                typeof lead.payload === "object" &&
                !Array.isArray(lead.payload)
                  ? lead.payload
                  : {};
              const payment =
                payload.onboarding_payment &&
                typeof payload.onboarding_payment === "object"
                  ? payload.onboarding_payment
                  : {};
              if (payment.status !== "paid") {
                const { error: updateError } = await supabaseAdmin
                  .from("onboarding_leads")
                  .update({
                    payload: {
                      ...payload,
                      onboarding_payment: {
                        ...payment,
                        status: event.type === "checkout.session.expired" ? "expired" : "failed",
                      },
                    },
                  })
                  .eq("id", leadId);
                if (updateError) throw updateError;
              }
            }
          }
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription =
          event.data.object as Stripe.Subscription;

        await retrieveAndSaveSubscription(
          stripe,
          supabaseAdmin,
          subscription.id,
        );

        break;
      }

      case "invoice.created":
      case "invoice.updated":
      case "invoice.finalized":
      case "invoice.finalization_failed":
      case "invoice.voided":
      case "invoice.marked_uncollectible":
      case "invoice.paid": {
        const invoice =
          event.data.object as Stripe.Invoice;

        const subscriptionId =
          getInvoiceSubscriptionId(invoice);

        if (subscriptionId) {
          await retrieveAndSaveSubscription(
            stripe,
            supabaseAdmin,
            subscriptionId,
          );
        } else {
          console.log(
            "Betaalde factuur zonder abonnement:",
            invoice.id,
          );
        }
        await saveInvoice(supabaseAdmin, invoice, event.type);

        break;
      }

      case "invoice.payment_failed": {
        const invoice =
          event.data.object as Stripe.Invoice;

        const subscriptionId =
          getInvoiceSubscriptionId(invoice);

        if (subscriptionId) {
          await retrieveAndSaveSubscription(
            stripe,
            supabaseAdmin,
            subscriptionId,
          );
        }
        await saveInvoice(supabaseAdmin, invoice, event.type);

        console.log("Betaling mislukt:", invoice.id);
        break;
      }

      case "invoice.payment_action_required": {
        const invoice =
          event.data.object as Stripe.Invoice;

        const subscriptionId =
          getInvoiceSubscriptionId(invoice);

        if (subscriptionId) {
          await retrieveAndSaveSubscription(
            stripe,
            supabaseAdmin,
            subscriptionId,
          );
        }
        await saveInvoice(supabaseAdmin, invoice, event.type);

        console.log(
          "Betalingsactie vereist:",
          invoice.id,
        );

        break;
      }

      case "charge.dispute.created":
      case "charge.refunded":
      case "radar.early_fraud_warning.created": {
        await logStripeRiskEvent(
          stripe,
          supabaseAdmin,
          event,
          event.data.object as unknown as Record<string, unknown>,
        );
        break;
      }

      default: {
        console.log(
          "Event ontvangen maar niet verwerkt:",
          event.type,
        );
      }
    }

    return jsonResponse({
      received: true,
    });
  } catch (error) {
    console.error(
      "Fout bij verwerken Stripe-webhook:",
      error,
    );

    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Onbekende webhookfout.",
      },
      500,
    );
  }
});
