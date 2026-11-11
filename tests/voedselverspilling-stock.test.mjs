import test from "node:test";
import assert from "node:assert/strict";
import { deductFoodWasteStock, reverseFoodWasteStock } from "../voedselverspilling-stock.mjs";

function stockItem(overrides = {}) {
  return {
    id: "stock-1",
    name: "Tomaten",
    unit: "kg",
    quantity: 5,
    batches: [
      { id: "batch-later", quantity: 3, expiryDate: "2026-12-20", receivedAt: "2026-11-01T08:00:00.000Z" },
      { id: "batch-sooner", quantity: 2, expiryDate: "2026-11-20", receivedAt: "2026-11-02T08:00:00.000Z" }
    ],
    ...overrides
  };
}

test("deducts using FEFO and records exact batch allocations", () => {
  const result = deductFoodWasteStock({
    stockItem: stockItem(), quantity: 2500, inputUnit: "g", sourceId: "waste-1"
  });
  assert.equal(result.status, "deducted");
  assert.equal(result.stockItem.quantity, 2.5);
  assert.deepEqual(result.allocations.map((item) => [item.batchId, item.quantity]), [
    ["batch-sooner", 2], ["batch-later", 0.5]
  ]);
  assert.equal(result.movement.delta, -1.5);
});

test("does not deduct when stock is insufficient", () => {
  const original = stockItem();
  const result = deductFoodWasteStock({
    stockItem: original, quantity: 6, inputUnit: "kg", sourceId: "waste-2"
  });
  assert.equal(result.status, "insufficient_stock");
  assert.equal(result.stockItem.quantity, 5);
  assert.equal(original.batches[0].quantity, 3);
});

test("does not deduct when units cannot be converted", () => {
  const result = deductFoodWasteStock({
    stockItem: stockItem({ unit: "stuk" }), quantity: 1, inputUnit: "kg", sourceId: "waste-3"
  });
  assert.equal(result.status, "unit_mismatch");
});

test("duplicate retries never deduct the same registration twice", () => {
  const item = stockItem();
  const first = deductFoodWasteStock({ stockItem: item, quantity: 500, inputUnit: "g", sourceId: "waste-4" });
  const retry = deductFoodWasteStock({
    stockItem: first.stockItem,
    quantity: 500,
    inputUnit: "g",
    sourceId: "waste-4",
    stockMovements: [first.movement]
  });
  assert.equal(retry.status, "already_applied");
  assert.equal(retry.stockItem, first.stockItem);
});

test("void restores the exact original batches and is idempotent", () => {
  const first = deductFoodWasteStock({ stockItem: stockItem(), quantity: 2500, inputUnit: "g", sourceId: "waste-5" });
  const movements = [first.movement];
  const reversed = reverseFoodWasteStock({
    stockItem: first.stockItem, sourceId: "waste-5", stockMovements: movements
  });
  assert.equal(reversed.status, "reversed");
  assert.equal(reversed.stockItem.quantity, 5);
  assert.deepEqual(reversed.stockItem.batches.map((batch) => [batch.id, batch.quantity]), [
    ["batch-sooner", 2], ["batch-later", 3]
  ]);
  const retry = reverseFoodWasteStock({
    stockItem: reversed.stockItem,
    sourceId: "waste-5",
    stockMovements: [first.movement, reversed.movement]
  });
  assert.equal(retry.status, "already_reversed");
  assert.equal(retry.stockItem.quantity, 5);
});

test("void recreates an original batch if it was later removed", () => {
  const first = deductFoodWasteStock({ stockItem: stockItem(), quantity: 1, inputUnit: "kg", sourceId: "waste-6" });
  const remainingBatches = first.stockItem.batches.filter((batch) => batch.id !== "batch-sooner");
  const reversed = reverseFoodWasteStock({
    stockItem: { ...first.stockItem, batches: remainingBatches },
    sourceId: "waste-6",
    stockMovements: [first.movement]
  });
  assert.equal(reversed.status, "reversed");
  assert.equal(reversed.stockItem.batches.find((batch) => batch.id === "batch-sooner").quantity, 1);
});
