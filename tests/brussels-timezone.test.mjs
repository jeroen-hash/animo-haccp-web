import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("const APP_TIME_ZONE='Europe/Brussels';");
const end = html.indexOf("function temperaturePointSource()", start);
if (start < 0 || end < 0) throw new Error("Belgium timezone helpers are missing.");
const helper = html.slice(start, end);

test("temperature datetime inputs convert Brussels winter and summer time to the correct UTC instant", () => {
  const result = vm.runInNewContext(helper + `
    ({
      winter: brusselsDateTimeToIso("2026-11-07T09:30"),
      summer: brusselsDateTimeToIso("2026-07-07T09:30"),
      winterInput: brusselsDateTimeInput("2026-11-07T08:30:00.000Z"),
      summerInput: brusselsDateTimeInput("2026-07-07T07:30:00.000Z")
    })
  `);
  assert.equal(result.winter, "2026-11-07T08:30:00.000Z");
  assert.equal(result.summer, "2026-07-07T07:30:00.000Z");
  assert.equal(result.winterInput, "2026-11-07T09:30");
  assert.equal(result.summerInput, "2026-07-07T09:30");
});

test("Belgian calendar day is used around UTC midnight", () => {
  const result = vm.runInNewContext(helper + `
    ({
      beforeMidnightUtc: localDay("2026-11-06T23:30:00.000Z"),
      dateOnly: localDay("2026-11-07")
    })
  `);
  assert.equal(result.beforeMidnightUtc, "2026-11-07");
  assert.equal(result.dateOnly, "2026-11-07");
});

test("temperature forms save Brussels wall-clock values as UTC timestamps and remove the unused cancellation copy", () => {
  assert.ok(html.includes("date:brusselsDateTimeToIso(data.date)"));
  assert.ok(html.includes("date=brusselsDateTimeToIso($('temperatureRecheckDate').value)"));
  assert.ok(!html.includes("Zelf opzeggen"));
  assert.ok(!html.includes("De klant kan het abonnement stopzetten aan het einde van de lopende betaalperiode"));
});
