import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const workerSource = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const EXPECTED_CACHE = "animo-haccp-shell-v7";

function createWorkerHarness(cacheNames = []) {
  const listeners = new Map();
  const deleted = [];
  const self = {
    location: { origin: "https://app.animo-apps.com" },
    clients: { claim: async () => {} },
    skipWaiting: async () => {},
    addEventListener: (name, callback) => listeners.set(name, callback),
  };
  const caches = {
    keys: async () => [...cacheNames],
    delete: async name => { deleted.push(name); return true; },
    open: async () => ({ addAll: async () => {}, add: async () => {} }),
    match: async () => null,
  };
  vm.runInNewContext(workerSource, { self, caches, URL, console, fetch: async () => ({ ok: true, clone() { return this; } }) });
  return { listeners, deleted };
}

test("service worker keeps the current app shell cache and removes obsolete ANIMO caches", async () => {
  const harness = createWorkerHarness([
    "animo-haccp-shell-v1",
    "animo-haccp-shell-v2",
    "animo-haccp-shell-v3",
    "animo-haccp-shell-v4",
    "animo-haccp-shell-v5",
    EXPECTED_CACHE,
    "unrelated-cache",
  ]);
  const activate = harness.listeners.get("activate");
  assert.equal(typeof activate, "function", "activate handler must be registered");
  let completion;
  activate({ waitUntil: promise => { completion = promise; } });
  await completion;
  assert.deepEqual(harness.deleted.sort(), [
    "animo-haccp-shell-v1",
    "animo-haccp-shell-v2",
    "animo-haccp-shell-v3",
    "animo-haccp-shell-v4",
    "animo-haccp-shell-v5",
  ]);
  assert.ok(!harness.deleted.includes(EXPECTED_CACHE), "activation must never delete the current app shell");
  assert.ok(!harness.deleted.includes("unrelated-cache"), "activation must not delete caches owned by other apps");
});

test("service worker cache version must not roll back to the stale offline PR cache", () => {
  assert.match(workerSource, new RegExp("const CACHE='" + EXPECTED_CACHE + "'"));
});

test("service worker never intercepts same-origin Supabase API requests", () => {
  const harness = createWorkerHarness([EXPECTED_CACHE]);
  const fetchHandler = harness.listeners.get("fetch");
  assert.equal(typeof fetchHandler, "function", "fetch handler must be registered");
  for (const path of ["/rest/v1/app_data", "/auth/v1/user", "/functions/v1/subscription-status", "/storage/v1/object/private/file"]) {
    let intercepted = false;
    fetchHandler({
      request: { method: "GET", url: "https://app.animo-apps.com" + path, mode: "cors" },
      respondWith: () => { intercepted = true; },
    });
    assert.equal(intercepted, false, "Supabase API path must bypass the service worker: " + path);
  }
});


test("service worker caches ES modules so app modules can be reused offline", () => {
  const harness = createWorkerHarness([EXPECTED_CACHE]);
  const fetchHandler = harness.listeners.get("fetch");
  let intercepted = false;
  fetchHandler({
    request: { method: "GET", url: "https://app.animo-apps.com/voedselverspilling-ui.mjs", mode: "cors" },
    respondWith: () => { intercepted = true; },
  });
  assert.equal(intercepted, true, "ES module requests must use the cache-aware fetch handler");
});
