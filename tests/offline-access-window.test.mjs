import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("function enforceOfflineAccessWindow(){");
const end = html.indexOf("function bootOfflineFromCache", start);
assert.ok(start >= 0 && end > start, "offline access expiry guard must exist");
const helper = html.slice(start, end);

function runGuard(meta) {
  const values = new Map([
    ["animo-offline-session-v1", JSON.stringify(meta)],
    [`favv-subscription-v1:${meta.businessId}`, JSON.stringify({ accessAllowed: true, plan: "monthly" })],
  ]);
  const state = { FAVVOfflineMode: true, FAVVOfflineAccessExpired: false };
  const navigations = [];
  const notices = [];
  const context = {
    window: state,
    OFFLINE_SESSION_KEY: "animo-offline-session-v1",
    localStorage: {
      getItem: key => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, value),
    },
    navigate: page => navigations.push(page),
    offlineNotice: (message, kind) => notices.push({ message, kind }),
  };
  vm.runInNewContext(helper + "\nglobalThis.guardResult = enforceOfflineAccessWindow();", context);
  return { result: context.guardResult, state, values, navigations, notices };
}

test("fresh offline session with unexpired trial remains available", () => {
  const now = Date.now();
  const result = runGuard({
    businessId: "biz-trial",
    verifiedAt: new Date(now - 60 * 60 * 1000).toISOString(),
    accessValidUntil: new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString(),
  });
  assert.equal(result.result, false);
  assert.deepEqual(result.navigations, []);
  assert.equal(result.state.FAVVOfflineAccessExpired, false);
});

test("open app is locked when the trial expires while the device stays offline", () => {
  const now = Date.now();
  const result = runGuard({
    businessId: "biz-trial-expired",
    verifiedAt: new Date(now - 60 * 60 * 1000).toISOString(),
    accessValidUntil: new Date(now - 1000).toISOString(),
  });
  assert.equal(result.result, true);
  assert.deepEqual(result.navigations, ["subscription"]);
  const cached = JSON.parse(result.values.get("favv-subscription-v1:biz-trial-expired"));
  assert.equal(cached.accessAllowed, false);
  assert.equal(cached.accessReason, "access_period_expired");
  assert.equal(result.state.FAVVOfflineAccessExpired, true);
});

test("open app is locked after 24 hours without an online access check", () => {
  const now = Date.now();
  const result = runGuard({
    businessId: "biz-offline-too-long",
    verifiedAt: new Date(now - 25 * 60 * 60 * 1000).toISOString(),
    accessValidUntil: null,
  });
  assert.equal(result.result, true);
  assert.deepEqual(result.navigations, ["subscription"]);
  const cached = JSON.parse(result.values.get("favv-subscription-v1:biz-offline-too-long"));
  assert.equal(cached.accessAllowed, false);
  assert.equal(cached.accessReason, "offline_verification_expired");
});
