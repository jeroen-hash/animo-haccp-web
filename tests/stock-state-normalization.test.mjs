import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const defaultsMatch = html.match(/const DEFAULTS=\{[^;]+\};/);
if (!defaultsMatch) throw new Error("Application DEFAULTS definition is missing.");

function extract(start, end) {
  const a = html.indexOf(start);
  const b = html.indexOf(end, a);
  if (a < 0 || b < 0) throw new Error("Missing stock state helper: " + start);
  return html.slice(a, b);
}

test("legacy cloud state receives missing collection defaults without losing stock", () => {
  const helper = extract("function normalizeStateCollections(value){", "const $=id=>");
  const script = defaultsMatch[0] + helper +
    'const legacy = { cleaning: [], temperatures: [], dishes: [], stock: [{ id: "stock-1", quantity: 10 }] };\\n' +
    'const normalized = normalizeStateCollections(legacy);\\n' +
    'const required = ["cleaning","temperatures","dishes","reports","stock","stockMovements","deliveries","recipes","productions","temperatureActions"];\\n' +
    'for (const key of required) if (!Array.isArray(normalized[key])) throw new Error(key + " must be an array");\\n' +
    'if (normalized.stock.length !== 1 || normalized.stock[0].quantity !== 10) throw new Error("Existing stock was not preserved");\\n' +
    'normalized.stockMovements.push({ id: "movement-1" }); normalized.deliveries.unshift({ id: "delivery-1" });\\n' +
    'if (normalized.stockMovements.length !== 1 || normalized.deliveries.length !== 1) throw new Error("New stock movement or delivery was rejected");';
  vm.runInNewContext(script, {});
});

test("cloud loading, local persistence, manual stock save, and XML confirmation normalize first", () => {
  assert.ok(html.includes("state=normalizeStateCollections(clone(x));state.stock=normalizeStockBatchData(state.stock);"));
  assert.ok(html.includes("function persist(){normalizeStateCollections(state);"));
  assert.ok(html.includes("function stockSave(){normalizeStateCollections(state);persist();renderStock()}"));
  assert.ok(html.includes("function stockMovement(product,delta,reason){normalizeStateCollections(state);state.stockMovements.unshift("));
  assert.ok(html.includes("function renderStock(){normalizeStateCollections(state);renderSupplierFilter();"));
  assert.ok(html.includes("function confirmDelivery(){\\n  normalizeStateCollections(state);\\n  if(!deliveryReviewRows.length)return;"));
});

test("stock movement can be recorded when legacy cloud data lacks stockMovements", () => {
  const helper = extract("function normalizeStateCollections(value){", "const $=id=>");
  const movement = extract("function stockMovement(product,delta,reason){", "function adjustStock(productId){");
  const script = defaultsMatch[0] + helper + movement +
    'function id(prefix) { return prefix + "-1"; }\\n' +
    'stockMovement({ id: "p1", name: "Eieren", unit: "stuks" }, 10, "Beginvoorraad");\\n' +
    'if (state.stockMovements.length !== 1 || state.stockMovements[0].delta !== 10) throw new Error("Stock movement was not recorded");';
  vm.runInNewContext(script, { state: {}, currentUser: { id: "test-user", name: "Test" } });
});
