import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("all eight HACCP modules are reachable from the app navigation", () => {
  assert.match(html, /data-page="haccp-modules"/);
  assert.match(html, /id="haccp-modules"/);
  for (const label of [
    "Bereidingscontroles", "Onderhoud en kalibratie",
    "Persoonlijke hygiëne en opleiding", "Water en afvalbeheer",
    "Klachten en terugroepingen", "Traceerbaarheid",
    "Productbeheer en etikettering", "HACCP-plan en procedures"
  ]) assert.ok(html.includes(label), "Missing module: " + label);
});

test("HACCP records are part of the existing persisted business state", () => {
  assert.match(html, /haccpRecords:\[\]/);
  assert.match(html, /target\.haccpRecords=Array\.isArray\(target\.haccpRecords\)/);
  assert.match(html, /state\.haccpRecords\.unshift\(/);
  assert.ok(html.includes('persist();form.reset();'), 'Saving a HACCP record must persist and reset the form');
});

test("all modules have dedicated structured fields and the daily report captures them", () => {
  const schema = html.slice(html.indexOf("const HACCP_MODULES=["), html.indexOf("function haccpFieldName"));
  assert.equal((schema.match(/\{id:'/g) || []).length, 8);
  for (const field of [
    "Kerntemperatuur", "Kalibratie", "Opleiding", "Wateranalyse",
    "Risico-evaluatie", "Lotnummer", "TGT-datum", "Kritische grens / criterium"
  ]) assert.ok(schema.includes(field), "Missing structured field: " + field);
  assert.match(html, /haccpRecords:clone\(\(state\.haccpRecords\|\|\[\]\)\.filter/);
  assert.match(html, /haccpRecordsBody\(r\.haccpRecords\|\|\[\]\)/);
  assert.match(html, /function printHaccpRecords\(\)/);
});

test("HACCP interface uses a focused professional overview instead of eight open forms", () => {
  assert.match(html, /class="haccp-page-head"/);
  assert.match(html, /class="haccp-module-grid"/);
  assert.match(html, /data-haccp-open=/);
  assert.match(html, /data-haccp-back/);
  assert.match(html, /class="haccp-overview"/);
  assert.match(html, /class="haccp-detail"/);
  assert.doesNotMatch(html, /<div class="card c6" style="margin-bottom:16px"><h3>\+module\.title/);
});
