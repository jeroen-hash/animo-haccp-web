import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("async function readOfflineSnapshot(businessId){");
const end = html.indexOf("function offlineNotice(", start);
assert.ok(start >= 0 && end > start, "offline outbox helpers must exist");
const helpers = html.slice(start, end);

function makeHarness() {
  const values = new Map();
  const RealDate = Date;
  let tick = 0;
  class FakeDate extends RealDate {
    constructor(...args) {
      if (args.length) super(...args);
      else super(RealDate.now() + tick++);
    }
  }
  const context = {
    cloudBusiness: { id: "test-business" },
    cloudRowUpdatedAt: "cloud-v1",
    localStorage: {
      getItem: key => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: key => values.delete(key),
    },
    openOfflineDb: async () => { throw new Error("IndexedDB unavailable in test"); },
    setStatus: () => {},
    console: { warn: () => {} },
    Date: FakeDate,
  };
  vm.runInNewContext(helpers + "\nglobalThis.api = { readOfflineSnapshot, queueOfflineSnapshot, clearOfflineSnapshot, rebaseOfflineSnapshot };", context);
  return { api: context.api, values };
}

test("offline snapshot is retained in localStorage when IndexedDB is unavailable", async () => {
  const { api, values } = makeHarness();
  const item = await api.queueOfflineSnapshot({ temperatures: [{ id: "t1", value: 7 }] });
  const stored = JSON.parse(values.get("animo-offline-outbox:test-business"));
  const dirty = JSON.parse(values.get("animo-offline-dirty:test-business"));
  assert.equal(stored.businessId, "test-business");
  assert.equal(stored.baseUpdatedAt, "cloud-v1");
  assert.equal(stored.data.temperatures[0].id, "t1");
  assert.equal(dirty.queuedAt, item.queuedAt);
  const recovered = await api.readOfflineSnapshot("test-business");
  assert.equal(recovered.queuedAt, item.queuedAt);
});

test("clearing an older successful save never deletes a newer offline edit", async () => {
  const { api, values } = makeHarness();
  const first = await api.queueOfflineSnapshot({ temperatures: [{ id: "first" }] });
  const second = await api.queueOfflineSnapshot({ temperatures: [{ id: "second" }] });
  await api.clearOfflineSnapshot("test-business", first.queuedAt);
  const stored = JSON.parse(values.get("animo-offline-outbox:test-business"));
  assert.equal(stored.queuedAt, second.queuedAt);
  assert.equal(stored.data.temperatures[0].id, "second");
  assert.ok(values.has("animo-offline-dirty:test-business"));
});

test("rebasing after an older save preserves newer queued data and advances its cloud version", async () => {
  const { api, values } = makeHarness();
  const first = await api.queueOfflineSnapshot({ temperatures: [{ id: "first" }] });
  const second = await api.queueOfflineSnapshot({ temperatures: [{ id: "second" }] });
  await api.rebaseOfflineSnapshot("test-business", first.queuedAt, "cloud-v2");
  const stored = JSON.parse(values.get("animo-offline-outbox:test-business"));
  const dirty = JSON.parse(values.get("animo-offline-dirty:test-business"));
  assert.equal(stored.queuedAt, second.queuedAt);
  assert.equal(stored.baseUpdatedAt, "cloud-v2");
  assert.equal(stored.data.temperatures[0].id, "second");
  assert.equal(dirty.baseUpdatedAt, "cloud-v2");
});
