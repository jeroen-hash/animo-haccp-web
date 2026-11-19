import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("product batches capture source and ingredient lot traceability", () => {
  assert.match(html, /id="labelSourceRef" required/);
  assert.match(html, /id="labelIngredientLots" rows="3" required/);
  assert.match(html, /sourceRef,ingredientLots,frozenAt/);
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
