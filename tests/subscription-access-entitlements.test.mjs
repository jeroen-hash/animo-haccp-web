import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../supabase/functions/subscription-status/index.ts", import.meta.url), "utf8");
const match = source.match(/function getAccessDecision\(input: \{[\s\S]*?\n\}\n(?=\nDeno\.serve)/);
assert.ok(match, "subscription access decision helper must exist");
const validDate = (value) => Boolean(value) && Number.isFinite(Date.parse(value)) && Date.parse(value) > Date.now();
const context = { isValidFutureDate: (value, now = Date.now()) => Boolean(value) && Number.isFinite(Date.parse(value)) && Date.parse(value) > now };
vm.createContext(context);
vm.runInContext(match[0] + "\nglobalThis.decide = getAccessDecision;", context);
const decide = context.decide;
const now = Date.parse("2026-11-07T12:00:00.000Z");
const date = minutes => new Date(now + minutes * 60_000).toISOString();

const base = { lifetimeFree: false, subscriptionStatus: "none", subscriptionPeriodEnd: null, trialStartedAt: date(-60), trialEndsAt: date(60), now };

test("active trial grants access until the exact expiry instant", () => {
  assert.equal(decide(base).accessReason, "trial_active");
  assert.equal(decide({ ...base, trialEndsAt: date(0) }).accessAllowed, false);
  assert.equal(decide({ ...base, trialEndsAt: date(0) }).accessReason, "trial_expired");
});

test("active paid subscription grants access while current period is in the future", () => {
  const result = decide({ ...base, trialEndsAt: date(-1), subscriptionStatus: "active", subscriptionPeriodEnd: date(1) });
  assert.equal(result.accessAllowed, true);
  assert.equal(result.accessReason, "subscription_active");
});

test("expired or non-active subscription does not grant access", () => {
  for (const status of ["canceled", "past_due", "unpaid", "incomplete", "none"]) {
    const result = decide({ ...base, trialEndsAt: date(-1), subscriptionStatus: status, subscriptionPeriodEnd: date(60) });
    assert.equal(result.accessAllowed, false, status);
  }
  const expired = decide({ ...base, trialEndsAt: date(-1), subscriptionStatus: "active", subscriptionPeriodEnd: date(0) });
  assert.equal(expired.accessAllowed, false);
});

test("lifetime-free exception always grants access", () => {
  const result = decide({ ...base, lifetimeFree: true, trialStartedAt: null, trialEndsAt: null });
  assert.equal(result.accessAllowed, true);
  assert.equal(result.accessReason, "lifetime_free");
});

test("trial cannot grant access before its start or without dates", () => {
  const beforeStart = decide({ ...base, trialStartedAt: date(1), trialEndsAt: date(60) });
  assert.equal(beforeStart.accessAllowed, false);
  assert.equal(beforeStart.accessReason, "trial_not_started");
  const missing = decide({ ...base, trialStartedAt: null, trialEndsAt: null });
  assert.equal(missing.accessAllowed, false);
  assert.equal(missing.accessReason, "trial_not_started");
});
