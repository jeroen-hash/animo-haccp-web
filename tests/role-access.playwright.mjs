import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const baseURL = process.env.ANIMO_TEST_URL || 'https://test.animo-apps.com';
const roles = [
  { key: 'OWNER', label: 'Eigenaar', expected: 'owner' },
  { key: 'MANAGER', label: 'Manager', expected: 'manager' },
  { key: 'EMPLOYEE', label: 'Medewerker', expected: 'employee' },
];

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`GitHub Secret ontbreekt: ${name}`);
  return value;
}

const browser = await chromium.launch({ headless: true });
let failures = 0;
try {
  for (const role of roles) {
    const email = required(`ANIMO_TEST_${role.key}_EMAIL`);
    const password = required(`ANIMO_TEST_${role.key}_PASSWORD`);
    const pin = required(`ANIMO_TEST_${role.key}_PIN`);
    const context = await browser.newContext();
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    try {
      console.log(`\n[ROLE] ${role.label}: aanmelden via ${baseURL}`);
      await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.locator('#cloudLoginForm').waitFor({ state: 'visible', timeout: 30000 });
      await page.locator('#cloudEmail').fill(email);
      await page.locator('#cloudPassword').fill(password);
      await page.locator('#cloudLoginForm button[type="submit"]').click();

      await page.locator('#loginForm').waitFor({ state: 'visible', timeout: 45000 });
      const business = page.locator('#loginBusiness');
      if (await business.locator('option').count() > 1) {
        const first = await business.locator('option').nth(1).getAttribute('value');
        if (first) await business.selectOption(first);
      }
      const user = page.locator('#loginUser');
      await user.waitFor({ state: 'visible' });
      if (await user.locator('option').count() > 1) {
        const first = await user.locator('option').nth(1).getAttribute('value');
        if (first) await user.selectOption(first);
      }
      await page.locator('#loginPin').fill(pin);
      await page.locator('#loginForm button[type="submit"]').click();

      await page.locator('#dashboard.page.active').waitFor({ state: 'visible', timeout: 45000 });
      const actualRole = (await page.locator('#sidebarRole').innerText()).trim();
      assert.equal(actualRole, role.label, `Verkeerde rol na aanmelden: ${actualRole}`);

      const managerNav = page.locator('[data-page="management"].manager-only');
      const subscriptionNav = page.locator('[data-page="subscription"].manager-only');
      if (role.expected === 'employee') {
        assert.equal(await managerNav.isVisible(), false, 'Medewerker ziet Beheer');
        assert.equal(await subscriptionNav.isVisible(), false, 'Medewerker ziet Abonnement');
      } else {
        assert.equal(await managerNav.isVisible(), true, `${role.label} ziet Beheer niet`);
        assert.equal(await subscriptionNav.isVisible(), true, `${role.label} ziet Abonnement niet`);
      }
      assert.deepEqual(pageErrors, [], `JavaScript-fouten voor ${role.label}`);
      console.log(`[PASS] ${role.label}: juiste sessie, rol en menu-rechten`);
    } catch (error) {
      failures++;
      console.error(`[FAIL] ${role.label}: ${error.stack || error.message}`);
      await page.screenshot({ path: `role-test-${role.key.toLowerCase()}-failure.png`, fullPage: true }).catch(() => {});
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
if (failures) process.exit(1);
console.log('\nAlle drie roltests geslaagd.');
