
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
      .select("stripe_subscription_id, status")
      .eq("business_id", businessId)
      .maybeSingle();

  if (currentBusinessSubscriptionError) {
    throw currentBusinessSubscriptionError;
  }

  const currentSubscriptionId =
    currentBusinessSubscription?.stripe_subscription_id ?? null;
  const currentSubscriptionStatus =
    currentBusinessSubscription?.status ?? null;
  const currentSubscriptionStillBlocksReplacement = [
    "active",
    "trialing",
    "past_due",
    "unpaid",
    "incomplete",
    "paused",
  ].includes(currentSubscriptionStatus ?? "");

  if (
    currentSubscriptionId &&
    currentSubscriptionId !== subscription.id &&
    currentSubscriptionStillBlocksReplacement
  ) {
    console.warn("Verouderd Stripe-event genegeerd; nieuwer abonnement blijft gekoppeld:", {
      business_id: businessId,
      incoming_subscription_id: subscription.id,
      current_subscription_id: currentSubscriptionId,
      current_status: currentSubscriptionStatus,
    });
    return;
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
