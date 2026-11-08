import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

function extract(signature, nextSignature) {
  const start = html.indexOf(signature);
  const end = html.indexOf(nextSignature, start);
  if (start < 0 || end < 0) throw new Error("Missing report helper: " + signature);
  return html.slice(start, end);
}

test("standalone allergen PDF exports the current allergen register", () => {
  const calls = [];
  const state = { dishes: [{ id: "dish-1", name: "Testgerecht", allergens: ["Gluten"] }] };
  const source = extract("function printAllergens(){", "function dayReportBody(");
  vm.runInNewContext(source + "; printAllergens()", {
    state,
    allergensBody: dishes => ({ dishes }),
    openPrint: (title, body) => calls.push({ title, body })
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].title, "Allergenenplan");
  assert.equal(calls[0].body.dishes, state.dishes);
});

test("day report PDF uses the selected saved report, not current live state", () => {
  const calls = [];
  const selected = { id: "R-test", dishes: [{ id: "dish-snapshot" }], temperatures: [], cleaning: [] };
  const state = { reports: [selected] };
  const source = extract("function printDayReport(reportId){", "function deleteDayReport(");
  vm.runInNewContext(source + "; printDayReport('R-test')", {
    state,
    dayReportBody: report => ({ report }),
    openPrint: (title, body) => calls.push({ title, body })
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].title, "Dagrapport autocontrole");
  assert.equal(calls[0].body.report, selected);
});

test("saved day report snapshots include the allergen register", () => {
  const source = extract("function reportSnapshot(){", "function htmlDoc(");
  const dishes = [{ id: "dish-1", name: "Testgerecht", allergens: ["Melk"] }];
  const result = vm.runInNewContext(source + "; reportSnapshot()", {
    state: { cleaning: [], temperatures: [], dishes },
    clone: value => JSON.parse(JSON.stringify(value)),
    Date
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result.dishes)), dishes);
});
