import test from "node:test";
import assert from "node:assert/strict";
import {
  convertWasteQuantity,
  calculateWasteCost,
  createFoodWasteEntry,
  normaliseWasteUnit
} from "../voedselverspilling-core.mjs";

test("gram and kilogram are converted correctly", () => {
  assert.equal(convertWasteQuantity(750, "gram", "kg"), 0.75);
  assert.equal(convertWasteQuantity(1.25, "kg", "g"), 1250);
});

test("volume units convert only within the same dimension", () => {
  assert.equal(convertWasteQuantity(75, "cl", "l"), 0.75);
  assert.equal(convertWasteQuantity(500, "ml", "l"), 0.5);
  assert.throws(() => convertWasteQuantity(500, "g", "ml"), /past niet/);
});

test("unit aliases are normalised", () => {
  assert.equal(normaliseWasteUnit("stuks"), "stuk");
  assert.equal(normaliseWasteUnit("kilogram"), "kg");
});

test("waste cost uses stock base unit and snapshots price", () => {
  const result = calculateWasteCost({
    quantity: 750, inputUnit: "g", stockUnit: "kg",
    purchasePrice: 12, purchaseQuantity: 1
  });
  assert.equal(result.stockQuantity, 0.75);
  assert.equal(result.value, 9);
  assert.equal(result.status, "Berekend");
});

test("missing cost remains unknown instead of being displayed as zero", () => {
  const result = calculateWasteCost({
    quantity: 250, inputUnit: "g", stockUnit: "kg",
    purchasePrice: null, purchaseQuantity: null
  });
  assert.equal(result.value, null);
  assert.equal(result.status, "Nog te bepalen");
});

test("registration requires a photo, a valid reason and positive quantity", () => {
  const base = {
    clientId: "test-client-id", businessId: "test-business", userId: "test-user",
    productName: "Kipfilet", quantity: 750, unit: "g",
    reason: "Product bedorven", photo: new Blob(["foto"], { type: "image/jpeg" }),
    stockItem: { id: "stock-1", unit: "kg", purchasePrice: 12, purchaseQuantity: 1 }
  };
  const entry = createFoodWasteEntry(base);
  assert.equal(entry.costSnapshot.value, 9);
  assert.equal(entry.syncStatus, "Wacht op synchronisatie");
  assert.throws(() => createFoodWasteEntry({ ...base, photo: null }), /foto/);
  assert.throws(() => createFoodWasteEntry({ ...base, quantity: 0 }), /groter.*dan nul/);
});

test("an incompatible stock unit does not block the waste report or invent a cost", () => {
  const entry = createFoodWasteEntry({
    clientId: "test-client-id", businessId: "test-business", userId: "test-user",
    productName: "Fles saus", quantity: 1, unit: "stuk", reason: "Beschadigd product",
    photo: new Blob(["foto"], { type: "image/jpeg" }),
    stockItem: { id: "stock-2", unit: "fles", purchasePrice: 8, purchaseQuantity: 1 }
  });
  assert.equal(entry.costSnapshot.value, null);
  assert.equal(entry.costSnapshot.status, "Nog te bepalen");
});

test("other reason requires an explanation", () => {
  const base = {
    clientId: "test-client-id", businessId: "test-business", userId: "test-user",
    productName: "Tomaten", quantity: 1, unit: "kg", reason: "Andere reden",
    photo: new Blob(["foto"], { type: "image/jpeg" })
  };
  assert.throws(() => createFoodWasteEntry(base), /toelichting/);
  assert.equal(createFoodWasteEntry({ ...base, note: "Verpakking gescheurd" }).reason, "Andere reden");
});
