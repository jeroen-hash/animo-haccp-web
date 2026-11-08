import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const landing = readFileSync(new URL("../landing.html", import.meta.url), "utf8");
const terms = readFileSync(new URL("../algemene-voorwaarden.html", import.meta.url), "utf8");
const ids = new Set([...landing.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]));

test("all public landing-page section links resolve", () => {
  const anchors = [...landing.matchAll(/\bhref=["']#([^"']+)["']/g)].map(match => match[1]);
  assert.ok(anchors.length > 0, "landing page should contain navigation anchors");
  const missing = [...new Set(anchors.filter(anchor => !ids.has(anchor)))];
  assert.deepEqual(missing, []);
});

test("landing-page screenshots, logo and icon files exist", () => {
  const assets = [...landing.matchAll(/\b(?:href|src)=["']\.\/([^"']+)["']/g)]
    .map(match => match[1])
    .filter(path => path.startsWith("images/"));
  assert.ok(assets.length > 0);
  for (const asset of new Set(assets)) {
    assert.ok(existsSync(new URL("../" + asset, import.meta.url)), "missing landing asset: " + asset);
  }
});

test("public offer matches the contractual price and trial terms", () => {
  for (const phrase of ["€55", "€550", "€75", "€175", "14 dagen"]) {
    assert.ok(landing.includes(phrase), "landing page is missing " + phrase);
  }
  for (const phrase of ["€55 per maand", "€550 per jaar", "€75 eenmalig", "€175 eenmalig", "14 dagen"]) {
    assert.ok(terms.includes(phrase), "terms are missing " + phrase);
  }
  assert.match(landing, /https:\/\/app\.animo-apps\.com\/\?signup=1/);
  assert.doesNotMatch(landing, /freelance-animo/i);
});

test("all public legal documents linked by the landing page are present", () => {
  for (const path of ["privacy.html", "algemene-voorwaarden.html", "verwerkersovereenkomst.html", "onboarding-form.html"]) {
    assert.ok(existsSync(new URL("../" + path, import.meta.url)), "missing linked public document: " + path);
  }
  assert.match(landing, /algemene-voorwaarden\.html/);
  assert.match(landing, /privacy\.html/);
  assert.match(landing, /verwerkersovereenkomst\.html/);
});
