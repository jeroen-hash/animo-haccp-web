import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const baseURL = process.env.ANIMO_TEST_URL || 'https://test.animo-apps.com';
const browser = await chromium.launch({ headless: true });
const failures = [];
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  const supabaseRequests = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    if (/\.supabase\.co\//i.test(request.url())) supabaseRequests.push(request.url());
  });

  let loaded = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.locator('#animo-test-role-panel').waitFor({ state: 'visible', timeout: 12000 });
      loaded = true;
      break;
    } catch (error) {
      if (attempt === 5) throw error;
      await page.waitForTimeout(5000);
    }
  }
  assert.equal(loaded, true, 'Testrolpaneel verschijnt niet op de testwebsite');
  await page.locator('#dashboard.page.active').waitFor({ state: 'visible', timeout: 20000 });
  assert.match(await page.locator('#animo-test-role-panel').innerText(), /geen e-mail, wachtwoord, betaling of cloudwijzigingen/i);

  const expected = [
    { role: 'owner', label: 'Eigenaar (test)', visible: true },
    { role: 'manager', label: 'Manager (test)', visible: true },
    { role: 'employee', label: 'Medewerker (test)', visible: false },
  ];

  for (const item of expected) {
    await page.locator(`#animo-test-role-panel button[data-role="${item.role}"]`).click();
    await page.waitForTimeout(250);
    const actualRole = await page.evaluate(() => window.FAVVCloudRole);
    assert.equal(actualRole, item.role, `Actieve testrol is fout: ${actualRole}`);
    const panelTitle = await page.locator('#animo-test-role-panel strong').innerText();
    const expectedTitle = item.label.replace(' (test)', '').toLowerCase();
    assert.ok(panelTitle.toLowerCase().includes(expectedTitle), `Rolpaneel toont verkeerde rol: ${panelTitle}`);
    const management = page.locator('[data-page="management"].manager-only').first();
    if (await management.count()) {
      assert.equal(await management.evaluate(el => getComputedStyle(el).display !== 'none'), item.visible, `Beheerrechten fout voor ${item.role}`);
    }
    const selected = await page.locator(`#animo-test-role-panel button[data-role="${item.role}"]`).getAttribute('aria-pressed');
    assert.equal(selected, 'true', `Rolknop ${item.role} is niet geselecteerd`);
    console.log(`[PASS] ${item.label}: actieve rol, rolpaneel en zichtbaarheid beheer gecontroleerd`);
  }

  const activeBusiness = await page.evaluate(() => localStorage.getItem('favv-active-business-v1'));
  assert.equal(activeBusiness, 'animo-test-sandbox-local', 'De actieve zaak is niet de lokale testsandbox');
  assert.deepEqual(supabaseRequests, [], 'De testomgeving stuurde verzoeken naar Supabase');
  assert.deepEqual(pageErrors, [], `JavaScript-fouten: ${pageErrors.join('; ')}`);
  await context.close();
  console.log('[PASS] lokale sandbox actief; geen Supabase-verzoeken; geen JavaScript-fouten');
} catch (error) {
  failures.push(error);
  console.error('[FAIL]', error.stack || error.message);
} finally {
  await browser.close();
}
if (failures.length) process.exit(1);
console.log('Alle ANIMO testmodus-browsertests geslaagd.');
