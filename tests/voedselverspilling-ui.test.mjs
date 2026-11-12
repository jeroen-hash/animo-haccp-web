import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { initFoodWasteUi } from "../voedselverspilling-ui.mjs";

const ui = await readFile(new URL("../voedselverspilling-ui.mjs", import.meta.url), "utf8");
const app = await readFile(new URL("../index.html", import.meta.url), "utf8");
const testDeploy = await readFile(new URL("../.github/workflows/deploy-strato-test.yml", import.meta.url), "utf8");

test("food waste UI module loads without touching the DOM at import time", () => {
  assert.equal(typeof initFoodWasteUi, "function");
});

test("food waste UI is wired in while source and test deployment keep separate Supabase projects", () => {
  assert.match(app, /FAVVGetSupabaseClient=\(\)=>cloudClient/);
  assert.match(app, /FAVVGetCurrentUser=\(\)=>currentUser/);
  assert.match(app, /<script type="module" src="\.\/voedselverspilling-ui\.mjs"><\/script>/);
  assert.match(ui, /const mobileNav = document\.querySelector\("\.mobile-nav"\)/);
  assert.match(ui, /foodWasteMobileNav/);
  assert.match(app, /class="mobile-nav"/);
  assert.match(app, /PUBLIC_SUPABASE_CONFIG=\{url:'https:\/\/zimzsovvtdmrthrflkgm\.supabase\.co'/);
  assert.doesNotMatch(app, /PUBLIC_SUPABASE_CONFIG=\{url:'https:\/\/xwjcwravfeldndwlugai\.supabase\.co'/);
  assert.match(testDeploy, /const productionConfig = "const PUBLIC_SUPABASE_CONFIG=\{url:'https:\/\/zimzsovvtdmrthrflkgm\.supabase\.co'/);
  assert.match(testDeploy, /const testConfig = "const PUBLIC_SUPABASE_CONFIG=\{url:'https:\/\/xwjcwravfeldndwlugai\.supabase\.co'/);
  assert.ok(testDeploy.indexOf("Testbestanden voorbereiden") < testDeploy.indexOf("Testconfiguratie uitsluitend in testbuild injecteren"));
  assert.match(testDeploy, /mirror -R --verbose out\/test \/test/);
});

test("every waste registration requires a photo and supports the independent offline queue", () => {
  assert.match(ui, /type="file" accept="image\/jpeg,image\/png,image\/webp"[^>]*required/);
  assert.match(ui, /enqueueFoodWasteEntry\(entry\)/);
  assert.match(ui, /syncFoodWasteQueue\(supabase,/);
  assert.match(ui, /foodWasteRetry/);
  assert.match(ui, /async function retryPending\(\)/);
  assert.match(ui, /food-waste-photos/);
});

test("linked waste registrations use idempotent batch deduction and void reversal", () => {
  assert.match(ui, /deductFoodWasteStock/);
  assert.match(ui, /reverseFoodWasteStock/);
  assert.match(ui, /FAVVApplyFoodWasteStockChange/);
  assert.match(ui, /beforeServerInsert: syncStockBeforeWasteRow/);
  assert.match(ui, /await reverseVoidedStockRows\(rows\)/);
  assert.match(app, /FAVVApplyFoodWasteStockChange=/);
  assert.match(app, /saveNow\(x\)/);
  assert.doesNotMatch(ui, /\.from\(["']stock["']\)/);
});

test("employee and manager views rely on the database row-level security policies", () => {
  assert.match(ui, /\.eq\("business_id", biz\.id\)/);
  assert.match(ui, /function canManage\(\)/);
  assert.match(ui, /data-fw-void/);
  assert.match(ui, /void_reason: reason\.trim\(\)/);
});


test("temporary offline and fetch failures show a calm local-queue message instead of a technical error", () => {
  assert.match(ui, /if \(!navigator\.onLine \|\| window\.FAVVOfflineMode\)/);
  assert.match(ui, /load failed\|failed to fetch\|networkerror\|network request failed/i);
  assert.match(ui, /Lokale registraties zijn veilig bewaard/);
  assert.match(ui, /bestaande serverregistraties worden opnieuw geladen zodra de verbinding hersteld is/);
});

test("a previously created but unsaved void reversal retries cloud persistence", () => {
  assert.match(ui, /const existingReversal = movements\.find/);
  assert.match(ui, /if \(existingReversal\) \{[\s\S]*?saveNow\?\.\(state\)/);
  assert.match(ui, /nog niet door de cloud bevestigd/);
});

test("cloud sync stores a merge base and only auto-merges non-overlapping concurrent changes", () => {
  assert.match(app, /baseData:baseData\?JSON\.parse\(JSON\.stringify\(baseData\)\):null/);
  assert.match(app, /store\.put\(item\)/);
  assert.match(app, /pending\.baseData/);
  assert.match(app, /cloudRowUpdatedAt=pending\.baseUpdatedAt\|\|null/);
  assert.match(app, /new Date\(indexed\.queuedAt\|\|0\)>=new Date\(local\.queuedAt\|\|0\)/);
  assert.match(app, /import\('\.\/snapshot-merge\.mjs'\)/);
  assert.match(app, /if\(merged\.ok\)/);
  assert.match(app, /mergeConflictPaths=merged\.conflicts/);
  assert.match(app, /p_expected_updated_at:remoteRow\.updated_at/);
  assert.match(app, /Er wordt niets overschreven/);
});
