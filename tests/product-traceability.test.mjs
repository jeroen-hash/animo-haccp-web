import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("product batches capture source and ingredient lot traceability", () => {
  assert.match(html, /id="labelSourceRef" maxlength="180"/);
  assert.match(html, /id="labelIngredientLots" rows="3" maxlength="1200"/);
  assert.match(html, /sourceReceiptId:selectedReceipt\?\.id\|\|null,sourceReceiptSupplier:selectedReceipt\?\.supplier\|\|\x27\x27,sourceReceiptInvoice:selectedReceipt\?\.invoiceNumber\|\|\x27\x27,sourceReceiptDate:selectedReceipt\?\.receivedAt\|\|\x27\x27,sourceReceiptLinks:selectedReceipt\?\.stockBatchLinks\|\|\[\],ingredientLots,frozenAt/);
  assert.match(html, /Vul de herkomst en gebruikte grondstoffen\/lotnummers in/);
});

test("frozen product batches require a freezing date", () => {
  assert.match(html, /id="labelFrozenAt" type="date"/);
  assert.match(html, /storage\.toLowerCase\(\)\.includes\('diepvries'\)&&!frozenAt/);
});

test("no-printer workflow instructs staff to put the batch code on the physical container", () => {
  assert.match(html, /Zonder printer:/);
  assert.match(html, /Schrijf deze code op het bakje/);
  assert.match(html, /vereiste datumgegevens leesbaar op een geschikt herbruikbaar label/);
});

test("traceability register export includes origin, ingredient lots and freezing date", () => {
  const start = html.indexOf("function printProductTraceabilityRegister()");
  const end = html.indexOf("function printProductLabel(", start);
  assert.ok(start >= 0 && end > start, "Traceability export helper should exist");
  const source = html.slice(start, end);
  for (const term of ["sourceRef", "ingredientLots", "frozenAt", "openPrint(", "fysieke identificatie"]) {
    assert.ok(source.includes(term), "Missing traceability export field: " + term);
  }
});

test("product batches can link to an existing accepted goods receipt and its stock lots", () => {
  assert.match(html, /id="labelReceiptSelect"/);
  assert.match(html, /sourceReceiptId:selectedReceipt\?\.id\|\|null/);
  assert.match(html, /sourceReceiptLinks:selectedReceipt\?\.stockBatchLinks\|\|\[\]/);
  assert.match(html, /stockBatchLinks:\[\]/);
  assert.match(html, /goodsReceiptId:receipt\.id/);
});

test("product batch closures are retained and audited instead of hard-deleted", () => {
  assert.match(html, /productLabelAudit:\[\]/);
  assert.match(html, /function recordProductLabelAudit\(/);
  assert.match(html, /recordProductLabelAudit\('created',record/);
  assert.match(html, /record\.status='void'/);
  assert.match(html, /recordProductLabelAudit\('closed',record/);
  assert.doesNotMatch(html, /state\.productLabels=\(state\.productLabels\|\|\[\]\)\.filter\(x=>x\.id!==del\.dataset\.labelDelete\)/);
});

test("traceability export contains linked stock lots and the audit history", () => {
  const start = html.indexOf("function printProductTraceabilityRegister()");
  const end = html.indexOf("function printProductLabel(", start);
  const source = html.slice(start, end);
  for (const term of ["sourceReceiptLinks", "stockBatchId", "Wijzigings- en afsluitingshistoriek", "productLabelAudit", "actorName"]) {
    assert.ok(source.includes(term), "Missing traceability evidence: " + term);
  }
});
