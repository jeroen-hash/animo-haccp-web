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


  // Functionele smoke-test op uitsluitend de lokale testsandbox.
  // Geen echte gebruikers, betalingen of cloudopslag worden aangeraakt.
  await page.locator('#animo-test-role-panel button[data-role="owner"]').click();
  const navButtons = page.locator('nav.nav button.nav-btn[data-page]');
  const navCount = await navButtons.count();
  assert.ok(navCount >= 10, `Verwacht minstens 10 navigatieonderdelen, gevonden: ${navCount}`);
  for (let i = 0; i < navCount; i++) {
    const button = navButtons.nth(i);
    const pageId = await button.getAttribute('data-page');
    await button.click();
    await page.locator(`#${pageId}.page.active`).waitFor({ state: 'visible', timeout: 5000 });
    assert.ok(await page.locator(`#${pageId} h1`).count(), `Paginatitel ontbreekt voor ${pageId}`);
  }
  console.log(`[PASS] ${navCount} navigatiepagina's openen zonder fout`);

  // Temperatuurregistratie bewaren en terugvinden.
  await page.locator('nav.nav button[data-page="temperatures"]').click();
  await page.locator('[data-action="new-temperature"]').click();
  await page.locator('#modalLayer.open').waitFor();
  await page.locator('#fDevice').fill('TEST-koelkast');
  await page.locator('#fType').selectOption('Koeling');
  await page.locator('#fValue').fill('4.2');
  await page.locator('#modalForm button[type="submit"]').click();
  await page.locator('#modalLayer:not(.open)').waitFor();
  assert.match(await page.locator('#temperatureList').innerText(), /TEST-koelkast/);
  console.log('[PASS] temperatuurmeting lokaal bewaren en terugvinden');

  // Stockproduct met verpakking, aankoopprijs en voorraadbatch bewaren.
  await page.locator('nav.nav button[data-page="stock"]').click();
  await page.locator('[data-stock-action="new-product"]').click();
  await page.locator('#stockProductModal.open').waitFor();
  await page.locator('#stockProductName').fill('TEST eieren');
  await page.locator('#stockProductUnit').selectOption('stuks');
  await page.locator('#stockProductMinimum').fill('2');
  await page.locator('#stockProductPurchaseQty').fill('10');
  await page.locator('#stockProductPurchasePrice').fill('5');
  await page.locator('[data-stock-action="add-batch"]').click();
  await page.locator('#stockBatchEditors input[data-batch-field="quantity"]').last().fill('10');
  await page.locator('#stockProductForm button[type="submit"]').click();
  await page.locator('#stockProductModal:not(.open)').waitFor();
  assert.match(await page.locator('#stockList').innerText(), /TEST eieren/);
  assert.match(await page.locator('#stockUnitCostPreview').innerText().catch(()=>''), /0,50|0\.50/);
  console.log('[PASS] stockproduct, batch en verpakkingskost lokaal bewaren');

  // Receptenmodule openen en de editor controleren met de nieuw aangemaakte stock.
  await page.locator('nav.nav button[data-page="recipes"]').click();
  await page.locator('[data-recipe-action="new"]').click();
  await page.locator('#recipeModalLayer.open').waitFor();
  await page.locator('#recipeName').fill('TEST omelet');
  assert.ok(await page.locator('#recipeIngredientEditors select').count(), 'Ingrediëntkeuze ontbreekt in recepteditor');
  await page.locator('[data-recipe-action="close"]').click();
  await page.locator('#recipeModalLayer:not(.open)').waitFor();
  console.log('[PASS] recepteneditor opent met stockingrediënten');

  // Dagafsluiting bewaren; PDF-dialoog bewust niet openen.
  await page.locator('nav.nav button[data-page="reports"]').click();
  page.once('dialog', dialog => dialog.accept());
  // Vervang de bevestiging voor PDF door annuleren; het rapport zelf blijft bewaard.
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('[data-action="create-day-report"]').click();
  await page.waitForTimeout(300);
  assert.match(await page.locator('#reportHistory').innerText(), /Dagrapport/);
  console.log('[PASS] dagrapport bewaren en historiek tonen');

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
