import test from "node:test";
import assert from "node:assert/strict";
import { mergeSnapshots } from "../snapshot-merge.mjs";

test("merges independent fields and independent records from two employees", () => {
  const base = {
    settings: { language: "nl", alerts: true },
    stock: [{ id: "eggs", quantity: 20, minimum: 5 }],
    stockMovements: [{ id: "initial", delta: 20 }]
  };
  const local = {
    settings: { language: "nl", alerts: false },
    stock: [{ id: "eggs", quantity: 20, minimum: 5 }, { id: "milk", quantity: 8 }],
    stockMovements: [{ id: "initial", delta: 20 }, { id: "waste-a", delta: -2 }]
  };
  const remote = {
    settings: { language: "fr", alerts: true },
    stock: [{ id: "eggs", quantity: 20, minimum: 4 }],
    stockMovements: [{ id: "initial", delta: 20 }, { id: "delivery-b", delta: 6 }]
  };

  const result = mergeSnapshots(base, local, remote);
  assert.equal(result.ok, true);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.data.settings, { language: "fr", alerts: false });
  assert.deepEqual(result.data.stock.map(item => item.id), ["eggs", "milk"]);
  assert.equal(result.data.stock[0].minimum, 4);
  assert.deepEqual(result.data.stockMovements.map(item => item.id), ["initial", "delivery-b", "waste-a"]);
});

test("refuses to merge concurrent edits to the same stock quantity", () => {
  const base = { stock: [{ id: "eggs", quantity: 20 }] };
  const local = { stock: [{ id: "eggs", quantity: 18 }] };
  const remote = { stock: [{ id: "eggs", quantity: 17 }] };

  const result = mergeSnapshots(base, local, remote);
  assert.equal(result.ok, false);
  assert.deepEqual(result.conflicts, ["stock[eggs].quantity"]);
});

test("refuses deletion-versus-edit conflicts and preserves remote preview", () => {
  const base = { stock: [{ id: "eggs", quantity: 20 }] };
  const local = { stock: [] };
  const remote = { stock: [{ id: "eggs", quantity: 15 }] };

  const result = mergeSnapshots(base, local, remote);
  assert.equal(result.ok, false);
  assert.deepEqual(result.conflicts, ["stock[eggs]"]);
  assert.deepEqual(result.data.stock, remote.stock);
});

test("merges independent additions to a list but refuses ambiguous primitive-array edits", () => {
  const result = mergeSnapshots(
    { stockMovements: [], tags: ["a"] },
    { stockMovements: [{ id: "a", delta: -1 }], tags: ["a", "b"] },
    { stockMovements: [{ id: "b", delta: -2 }], tags: ["a", "c"] }
  );
  assert.equal(result.ok, false);
  assert.deepEqual(result.conflicts, ["tags"]);
  assert.deepEqual(result.data.stockMovements.map(item => item.id), ["b", "a"]);
});

test("refuses ambiguous duplicate record IDs", () => {
  const result = mergeSnapshots(
    { stock: [{ id: "eggs", quantity: 20 }] },
    { stock: [{ id: "eggs", quantity: 18 }, { id: "eggs", quantity: 17 }] },
    { stock: [{ id: "eggs", quantity: 19 }] }
  );
  assert.equal(result.ok, false);
  assert.deepEqual(result.conflicts, ["stock"]);
});

test("refuses different records created concurrently with the same ID", () => {
  const result = mergeSnapshots(
    { stockMovements: [] },
    { stockMovements: [{ id: "same-id", delta: -2 }] },
    { stockMovements: [{ id: "same-id", delta: -5 }] }
  );
  assert.equal(result.ok, false);
  assert.deepEqual(result.conflicts, ["stockMovements[same-id]"]);
});
