import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(
  new URL("../prototypes/voedselverspilling-demo.html", import.meta.url),
  "utf8"
);
const script = html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];

test("food waste mobile demo script is valid JavaScript", () => {
  assert.ok(script, "demo script must exist");
  assert.doesNotThrow(() => new vm.Script(script));
});

test("demo uses the production photo constraints and does not connect to Supabase", () => {
  assert.match(html, /accept="image\/jpeg,image\/png,image\/webp"/i);
  assert.match(html, /5\s*\*\s*1024\s*\*\s*1024/);
  assert.doesNotMatch(html, /supabase\.co|createClient\s*\(/i);
  assert.match(html, /alleen lokaal in deze browser/i);
});
