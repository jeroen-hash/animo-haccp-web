import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { initFoodWasteUi } from "../voedselverspilling-ui.mjs";

const ui = await readFile(new URL("../voedselverspilling-ui.mjs", import.meta.url), "utf8");
const app = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("food waste UI module loads without touching the DOM at import time", () => {
  assert.equal(typeof initFoodWasteUi, "function");
});

test("food waste UI is wired into the feature preview and uses the isolated test project", () => {
  assert.match(app, /FAVVGetSupabaseClient=\(\)=>cloudClient/);
  assert.match(app, /FAVVGetCurrentUser=\(\)=>currentUser/);
  assert.match(app, /import \{ initFoodWasteUi \} from "\.\/voedselverspilling-ui\.mjs"/);
  assert.match(app, /PUBLIC_SUPABASE_CONFIG=\{url:'https:\/\/xwjcwravfeldndwlugai\.supabase\.co'/);
  assert.doesNotMatch(app, /PUBLIC_SUPABASE_CONFIG=\{url:'https:\/\/zimzsovvtdmrthrflkgm\.supabase\.co'/);
});

test("every waste registration requires a photo and supports the independent offline queue", () => {
  assert.match(ui, /type="file" accept="image\/jpeg,image\/png,image\/webp"[^>]*required/);
  assert.match(ui, /enqueueFoodWasteEntry\(entry\)/);
  assert.match(ui, /syncFoodWasteQueue\(supabase\)/);
  assert.match(ui, /food-waste-photos/);
});

test("food waste remains reporting-only and does not alter stock or the full app snapshot", () => {
  assert.match(ui, /Voedselverspilling vermindert de stock niet automatisch/);
  assert.doesNotMatch(ui, /stockMovements|FAVVCloudSync|app_data|localStorage\.setItem/);
  assert.doesNotMatch(ui, /\.from\(["']stock["']\)/);
});

test("employee and manager views rely on the database row-level security policies", () => {
  assert.match(ui, /\.eq\("business_id", biz\.id\)/);
  assert.match(ui, /function canManage\(\)/);
  assert.match(ui, /data-fw-void/);
  assert.match(ui, /void_reason: reason\.trim\(\)/);
});
