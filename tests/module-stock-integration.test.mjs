import test from "node:test";
import assert from "node:assert/strict";
import { buildSalesStockDeductionPlan } from "../menurendabiliteit-core.mjs";
import { deductFoodWasteStock, reverseFoodWasteStock } from "../voedselverspilling-stock.mjs";

function stock(quantity) {
  return {
    id: "eggs",
    name: "Eieren",
    unit: "stuk",
    quantity,
    batches: [{ id: "batch-1", quantity, expiryDate: "2026-12-01", receivedAt: "2026-11-01T08:00:00Z" }]
  };
}

function menuPlan(currentStock, portions = 6) {
  return buildSalesStockDeductionPlan(
    [{ dishId: "omelet", product: "Omelet", quantity: portions }],
    [{ id: "omelet", name: "Omelet", yield: 1, ingredients: [{ stockId: "eggs", quantity: 1 }] }],
    [currentStock]
  );
}

test("voedselverspilling en kassaverkoop rekenen met dezelfde actuele voorraad", () => {
  const initial = stock(10);
  const waste = deductFoodWasteStock({
    stockItem: initial,
    quantity: 4,
    inputUnit: "stuk",
    sourceId: "waste-001",
    stockMovements: []
  });

  assert.equal(waste.status, "deducted");
  assert.equal(waste.stockItem.quantity, 6);
  assert.equal(menuPlan(waste.stockItem).status, "ready");
  assert.equal(menuPlan(waste.stockItem, 7).status, "insufficient_stock");
  assert.equal(menuPlan(waste.stockItem, 7).shortages[0].shortage, 1);
});

test("na een verspillingsterugboeking is de herstelde batch opnieuw beschikbaar voor kassaverkoop", () => {
  const initial = stock(10);
  const waste = deductFoodWasteStock({
    stockItem: initial,
    quantity: 4,
    inputUnit: "stuk",
    sourceId: "waste-002",
    stockMovements: []
  });
  const reversal = reverseFoodWasteStock({
    stockItem: waste.stockItem,
    sourceId: "waste-002",
    stockMovements: [waste.movement]
  });

  assert.equal(reversal.status, "reversed");
  assert.equal(reversal.stockItem.quantity, 10);
  assert.equal(menuPlan(reversal.stockItem, 10).status, "ready");
  assert.equal(menuPlan(reversal.stockItem, 11).status, "insufficient_stock");
});

test("een eerder berekend kassaplan mag geen voorraadtekort na verspilling omzeilen", () => {
  const initial = stock(10);
  assert.equal(menuPlan(initial, 8).status, "ready");

  const waste = deductFoodWasteStock({
    stockItem: initial,
    quantity: 5,
    inputUnit: "stuk",
    sourceId: "waste-003",
    stockMovements: []
  });
  assert.equal(waste.status, "deducted");

  // The menu module must recalculate against the current shared state before deduction.
  assert.equal(menuPlan(waste.stockItem, 8).status, "insufficient_stock");
});
