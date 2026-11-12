import test from "node:test";
import assert from "node:assert/strict";
import {
  parseEuroAmount, parseCsv, normalizeSalesCsv, salesTotalExcludingVat,
  dishEconomics, buildDishSalesSummary, classifyMenuItems,
  findDuplicateSalesLines, salesImportFingerprint, recipeCostSnapshotForDate, createCostSnapshot
} from "../menurendabiliteit-core.mjs";

test("Eurobedragen aanvaardt Belgische en internationale notatie", () => {
  assert.equal(parseEuroAmount("€ 1.234,50"), 1234.5);
  assert.equal(parseEuroAmount("1,25"), 1.25);
  assert.equal(parseEuroAmount("1,234.50"), 1234.5);
  assert.equal(parseEuroAmount("ongeldig"), null);
});

test("CSV parser verwerkt puntkomma, aanhalingstekens en komma in omschrijving", () => {
  assert.deepEqual(parseCsv('Datum;Product;Aantal\n2026-11-01;"Pasta, groot";2'), [
    ["Datum", "Product", "Aantal"], ["2026-11-01", "Pasta, groot", "2"]
  ]);
});

test("verkoopimport normaliseert regels en meldt ongeldige regels", () => {
  const result = normalizeSalesCsv("Datum;Product;Aantal;Totaal;BTW %\n2026-11-01;Pasta;2;30,00;12");
  assert.equal(result.rows[0].totalInclusive, 30);
  assert.equal(result.rows[0].vatRate, 12);
  assert.equal(result.errors.length, 0);
  assert.equal(normalizeSalesCsv("Datum/Tijd;Productnaam;Aantal;Totaal incl. btw\n01/11/2026 18:30;Pasta;1;12,00").rows[0].date, "2026-11-01");
  assert.equal(normalizeSalesCsv("Datum;Product;Aantal;Totaal excl. btw\n01/11/2026;Pasta;1;10,00").errors.length > 0, true);
  assert.equal(normalizeSalesCsv("Datum;Product\n2026-11-01;Pasta").errors.length > 0, true);
});

test("omzet exclusief btw gebruikt btw-tarief expliciet", () => {
  assert.equal(salesTotalExcludingVat(112, 12), 100);
  assert.equal(salesTotalExcludingVat(121, 21), 100);
  assert.equal(salesTotalExcludingVat(10, null), null);
});

test("gerechtmarge gebruikt receptkost per portie en verkoopprijs exclusief btw", () => {
  const result = dishEconomics({
    recipe: { id: "r1", yield: 5, version: 2 },
    ingredientCost: 25,
    sellingPriceInclusive: 11.2,
    vatRate: 12
  });
  assert.equal(result.ingredientCostPerPortion, 5);
  assert.equal(result.sellingPriceExclusive, 10);
  assert.equal(result.grossProfitPerPortion, 5);
  assert.equal(result.grossMarginPercent, 50);
});

test("geen verzonnen economie wanneer prijs, kost of btw ontbreekt", () => {
  assert.equal(dishEconomics({ recipe: { yield: 1 }, ingredientCost: 4, sellingPriceInclusive: 0, vatRate: null }).status, "missing_vat_rate");
  assert.equal(dishEconomics({ recipe: { yield: 1 }, ingredientCost: 4, sellingPriceInclusive: 5, vatRate: 6 }).status, "ok");
  assert.equal(dishEconomics({ recipe: { yield: 1 }, ingredientCost: NaN, sellingPriceInclusive: 5, vatRate: 6 }).status, "missing_cost");
  assert.equal(dishEconomics({ recipe: { yield: 1, ingredientCostComplete: false }, ingredientCost: 0, sellingPriceInclusive: 5, vatRate: 6 }).status, "missing_cost");
});

test("verkoopoverzicht rekent omzet, ingrediëntkost en brutowinst", () => {
  const rows = [{ product: "Pasta", quantity: 2, totalInclusive: 22.4, vatRate: 12 }];
  const result = buildDishSalesSummary(rows, { pasta: "r1" }, {
    r1: { status: "ok", ingredientCostPerPortion: 5 }
  });
  assert.equal(result.dishes[0].portions, 2);
  assert.equal(result.dishes[0].revenueExclusive, 20);
  assert.equal(result.dishes[0].ingredientCost, 10);
  assert.equal(result.dishes[0].grossProfit, 10);
});

test("menu-engineering classificeert op transparante mediaandrempels", () => {
  const result = classifyMenuItems([
    { id: "a", portions: 100, grossProfitPerPortion: 8 },
    { id: "b", portions: 90, grossProfitPerPortion: 2 },
    { id: "c", portions: 10, grossProfitPerPortion: 7 },
    { id: "d", portions: 5, grossProfitPerPortion: 1 }
  ]);
  assert.deepEqual(result.map(x => x.classification), ["star", "workhorse", "puzzle", "dog"]);
});

test("dubbele transactieregels worden niet opnieuw geïmporteerd", () => {
  const old = [{ transactionId: "T1", product: "Pasta", quantity: 1, totalInclusive: 10 }];
  const incoming = [
    { transactionId: "T1", product: "Pasta", quantity: 1, totalInclusive: 10 },
    { transactionId: "T2", product: "Soep", quantity: 1, totalInclusive: 5 }
  ];
  const result = findDuplicateSalesLines(old, incoming);
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.unique.length, 1);
});

test("bestandsfingerprint blijft compact en is onafhankelijk van de bestandsnaam", () => {
  const rows = [{ date: "2026-11-01", product: "Pasta", quantity: 1, totalInclusive: 10, vatRate: 12 }];
  const first = salesImportFingerprint("kassa-a.csv", rows);
  const second = salesImportFingerprint("kassa-b.csv", rows);
  assert.equal(first, second);
  assert.ok(first.length < 80);
});

test("onvolledige btw-data levert geen misleidende omzet of brutowinst op", () => {
  const result = buildDishSalesSummary([
    { product: "Pasta", quantity: 1, totalInclusive: 11.2, vatRate: 12 },
    { product: "Pasta", quantity: 1, totalInclusive: 11.2, vatRate: null }
  ], { pasta: "r1" }, { r1: { status: "ok", ingredientCostPerPortion: 5 } });
  assert.equal(result.dishes[0].revenueExclusive, null);
  assert.equal(result.dishes[0].grossProfit, null);
  assert.equal(result.dishes[0].missingVatRows, 1);
});

test("historische verkoop gebruikt vastgelegde receptkost, niet de huidige receptkost", () => {
  const result = buildDishSalesSummary([
    { product: "Pasta", dishId: "r1", quantity: 1, totalInclusive: 11.2, vatRate: 12, ingredientCostPerPortionSnapshot: 3, recipeVersion: 1 }
  ], {}, { r1: { status: "ok", ingredientCostPerPortion: 9 } });
  assert.equal(result.dishes[0].ingredientCost, 3);
  assert.equal(result.dishes[0].grossProfit, 7);
});

test("later gewijzigde productmapping vult geen historische kost in voor oude niet-gekoppelde imports", () => {
  const result = buildDishSalesSummary([
    { importId: "old-import", product: "Pasta", quantity: 1, totalInclusive: 11.2, vatRate: 12, ingredientCostPerPortionSnapshot: null }
  ], { pasta: "r1" }, { r1: { status: "ok", ingredientCostPerPortion: 9 } });
  assert.equal(result.unmapped.length, 1);
  assert.equal(result.dishes.length, 0);
});

test("verkoopregels gebruiken de bewaarde receptversie op de verkoopdatum", () => {
  const recipe = {
    id: "r1", version: 2, yield: 5, createdAt: "2026-01-01T08:00:00Z",
    updatedAt: "2026-02-01T10:00:00Z",
    versions: [{ version: 1, yield: 4, cost: 20, savedAt: "2026-02-01T10:00:00Z" }]
  };
  const historical = recipeCostSnapshotForDate(recipe, "2026-01-15", 30, true);
  assert.equal(historical.recipeVersion, 1);
  assert.equal(historical.ingredientCostPerPortion, 5);
  assert.equal(historical.source, "saved_recipe_version");
  const current = recipeCostSnapshotForDate(recipe, "2026-02-02", 30, true);
  assert.equal(current.recipeVersion, 2);
  assert.equal(current.ingredientCostPerPortion, 6);
  assert.equal(recipeCostSnapshotForDate(recipe, "2026-02-01", 30, true), null);
});

test("kostprijsmomentopname bewaart receptversie en berekende kost", () => {
  const snapshot = createCostSnapshot({
    recipe: { id: "r1", name: "Pasta", version: 3, yield: 4 },
    ingredientCost: 18,
    capturedAt: "2026-11-01T12:00:00Z"
  });
  assert.equal(snapshot.recipeVersion, 3);
  assert.equal(snapshot.ingredientCostPerPortion, 4.5);
  assert.equal(snapshot.capturedAt, "2026-11-01T12:00:00Z");
});
