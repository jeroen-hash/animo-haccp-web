import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const form = read("../onboarding-form.html");
const submit = read("../supabase/functions/submit-onboarding-lead/index.ts");
const checkout = read("../supabase/functions/create-onboarding-payment/index.ts");
const activate = read("../supabase/functions/activate-onboarding-lead/index.ts");
const webhook = read("../supabase/functions/stripe-webhook/index.ts");
const dashboard = read("../onboarding-dashboard.html");
const activationUi = read("../onboarding-activation.js");
const invite = read("../supabase/functions/onboarding-invite-user/index.ts");
const inviteUi = read("../onboarding-invite-users.js");
const migration = read("../supabase/migrations/20261107102332_add_onboarding_invoice_reporting.sql");
const adminDashboard = read("../admin-dashboard.html");

test("public onboarding form keeps the one-time fees separate from subscriptions", () => {
  assert.match(form, /Gedeeltelijke inrichting door ANIMO \(€75 eenmalig, excl\. btw \(€90,75 incl\. btw\)\)/);
  assert.match(form, /Volledige inrichting door ANIMO \(€175 eenmalig, excl\. btw \(€211,75 incl\. btw\)\)/);
  assert.match(form, /Zelfstandig starten na activatie \(gratis\)/);
  assert.match(form, /create-onboarding-payment/);
  assert.match(form, /window\.location\.assign\(checkout\.url\)/);
});

test("server locks the public service choice to fixed EUR cent amounts", () => {
  assert.match(submit, /zelfstandig:\s*0/);
  assert.match(submit, /basis:\s*7500/);
  assert.match(submit, /begeleid:\s*17500/);
  assert.match(submit, /onboarding_payment_required/);
});

test("one-time Checkout uses fixed amounts, exclusive tax, automatic tax and invoice creation", () => {
  assert.match(checkout, /amount:\s*7500/);
  assert.match(checkout, /amount:\s*17500/);
  assert.match(checkout, /mode:\s*"payment"/);
  assert.match(checkout, /tax_behavior:\s*"exclusive"/);
  assert.match(checkout, /automatic_tax:\s*\{\s*enabled:\s*true\s*\}/);
  assert.match(checkout, /invoice_creation:\s*\{/);
  assert.match(checkout, /invoice_data:\s*\{/);
  assert.match(checkout, /tax_id_collection:\s*\{\s*enabled:\s*true\s*\}/);
  assert.match(checkout, /platform_admins/);
  assert.match(checkout, /upload_token/);
  assert.match(checkout, /isPublicCustomerCheckout/);
});

test("newly activated businesses receive one 14-day trial and are not lifetime-free by default", () => {
  assert.match(activate, /trialStartedAt = new Date\(\)/);
  assert.match(activate, /14 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(activate, /trial_started_at: trialStartedAt\.toISOString\(\)/);
  assert.match(activate, /trial_ends_at: trialEndsAt\.toISOString\(\)/);
  assert.match(activate, /trial_used_at: trialStartedAt\.toISOString\(\)/);
  assert.match(activate, /lifetime_free: false/);
});

test("new paid onboarding requests cannot activate before a confirmed payment", () => {
  assert.match(activate, /onboarding_payment_required === true/);
  assert.match(activate, /onboardingPayment\.status !== "paid"/);
  assert.match(activationUi, /onboarding_payment\?\.status !== 'paid'/);
});

test("verified Stripe webhook records payment and tax amounts on the lead", () => {
  assert.match(webhook, /payment_kind === "onboarding_fee"/);
  assert.match(webhook, /status:\s*"paid"/);
  assert.match(webhook, /amount_paid:\s*session\.amount_total/);
  assert.match(webhook, /amount_tax:\s*session\.total_details\?\.amount_tax/);
  assert.match(webhook, /eventType === "invoice.payment_failed"/);
  assert.match(webhook, /eventType === "invoice.paid"/);
});

test("platform onboarding dashboard exposes the payment link only after approval", () => {
  assert.match(dashboard, /create-onboarding-payment/);
  assert.match(dashboard, /x\.status==='approved'/);
  assert.match(dashboard, /Betalingsstatus/);
  assert.match(dashboard, /mailto:/);
  assert.match(dashboard, /latestPayload/);
  assert.match(dashboard, /pay\.status==='paid'/);
});
test("onboarding user invitations pass the converted intake ID, not the public lead ID", () => {
  assert.match(dashboard, /converted_intake_id:l\.converted_intake_id/);
  assert.match(dashboard, /data-intake-id=/);
  assert.match(inviteUi, /data-intake-id/);
  assert.match(inviteUi, /dataset\.intakeId/);
  assert.match(inviteUi, /Deze aanvraag is nog niet geactiveerd/);
  assert.match(read("../supabase/functions/onboarding-invite-user/index.ts"), /\.maybeSingle\(\)/);
});

test("one-time Stripe invoices are included in the real payments report", () => {
  assert.match(checkout, /payment_kind: "onboarding_fee"/);
  assert.match(webhook, /source_type: onboardingLeadId \? "onboarding_fee" : "subscription"/);
  assert.match(migration, /source_reference/);
  assert.match(migration, /l\.business_name/);
  assert.match(adminDashboard, /Eenmalige onboarding/);
});

test("onboarding payment success and cancel URLs always return to the official ANIMO app", () => {
  assert.ok(checkout.includes('const appUrl = "https://app.animo-apps.com";'));
  assert.ok(checkout.includes("success_url: isPublicCustomerCheckout"));
  assert.ok(checkout.includes("onboarding-form.html?payment=success"));
  assert.ok(!checkout.includes('Deno.env.get("APP_URL")'));
});

test("onboarding invitations always redirect to the official ANIMO app", () => {
  assert.ok(activate.includes('const APP_URL = "https://app.animo-apps.com/";'));
  assert.ok(activate.includes("redirectTo: APP_URL"));
  assert.ok(invite.includes('const APP_URL = "https://app.animo-apps.com/";'));
  assert.ok(invite.includes("redirectTo: APP_URL"));
  assert.ok(!activate.includes('Deno.env.get("APP_URL")'));
  assert.ok(!invite.includes('Deno.env.get("APP_URL")'));
});
