import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const baseURL = process.env.ANIMO_TEST_URL || 'https://test.animo-apps.com';
const browser = await chromium.launch({ headless: true });
const failures = [];
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  let loaded = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.locator('#cloudLoginForm').waitFor({ state: 'visible', timeout: 15000 });
      loaded = true;
      break;
    } catch (error) {
      if (attempt === 5) throw error;
      await page.waitForTimeout(5000);
    }
  }
  assert.equal(loaded, true, 'Normaal e-mail/wachtwoord-aanmeldscherm verschijnt niet');
  assert.equal(await page.locator('#animo-test-role-panel').count(), 0, 'Tijdelijke rolkeuze is nog zichtbaar');
  assert.equal(await page.locator('#cloudSetup').evaluate(el => el.classList.contains('cloud-hidden')), true,
    'De eenmalige Supabase-instelling wordt onverwacht getoond');
  assert.equal(await page.locator('#cloudEmail').getAttribute('type'), 'email');
  assert.equal(await page.locator('#cloudPassword').getAttribute('type'), 'password');
  assert.equal(await page.locator('#cloudLoginForm button[type="submit"]').innerText(), 'Aanmelden');
  assert.equal(await page.locator('#cloudOpenPasswordReset').isVisible(), true, 'Wachtwoordherstel ontbreekt');
  assert.equal(await page.locator('#cloudOpenSignup').isVisible(), true, 'Registratielink ontbreekt');

  const config = await page.evaluate(() => JSON.parse(localStorage.getItem('favv-supabase-public-config-v1') || 'null'));
  assert.equal(config?.url, 'https://zimzsovvtdmrthrflkgm.supabase.co', 'Testapp gebruikt niet het afgesproken testproject');
  assert.ok(config?.key?.startsWith('sb_publishable_'), 'Veilige publieke Supabase-sleutel ontbreekt');
  assert.deepEqual(pageErrors, [], `JavaScript-fouten: ${pageErrors.join('; ')}`);
  await context.close();
  console.log('[PASS] gewone login met e-mailadres en wachtwoord zichtbaar');
  console.log('[PASS] tijdelijke rolkeuze verwijderd');
  console.log('[PASS] wachtwoordherstel en nieuwe-klantregistratie beschikbaar');
  console.log('[PASS] testapp gebruikt uitsluitend het afgesproken Supabase-testproject');
  console.log('[PASS] geen JavaScript-fouten bij laden');
} catch (error) {
  failures.push(error);
  console.error('[FAIL]', error.stack || error.message);
} finally {
  await browser.close();
}
if (failures.length) process.exit(1);
console.log('Alle ANIMO test-login-browsertests geslaagd.');
