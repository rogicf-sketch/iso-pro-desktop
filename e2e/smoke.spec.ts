import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/#/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

test('dist servido pelo preview (HTML base)', async ({ request }) => {
  const response = await request.get('/');
  expect(response.ok()).toBeTruthy();
  const html = await response.text();
  expect(html).toContain('data-e2e="app-root"');
  expect(html).toMatch(/I\.S\.O PRO/);
});

test('página de login carrega (hash router)', async ({ page, baseURL }) => {
  const loginUrl = new URL('/#/login', baseURL!).toString();
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/I\.S\.O PRO/);
  await expect(page.locator('[data-e2e="app-root"]')).toBeAttached();
  await expect(page.locator('[data-e2e="login-title"]')).toHaveText('Entrar', { timeout: 45_000 });
});

test('login exige credenciais antes de submeter', async ({ page, baseURL }) => {
  const loginUrl = new URL('/#/login', baseURL!).toString();
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-e2e="login-submit"]').click();
  await expect(page.locator('[data-e2e="login-error"]')).toBeVisible({ timeout: 15_000 });
});

const e2eLogin = process.env.ISO_PRO_E2E_LOGIN?.trim();
const e2eSenha = process.env.ISO_PRO_E2E_SENHA?.trim();
const e2eTenant = process.env.ISO_PRO_E2E_TENANT_ID?.trim();

test('login remoto com credenciais E2E (opcional)', async ({ page, baseURL }) => {
  test.skip(!e2eLogin || !e2eSenha, 'Defina ISO_PRO_E2E_LOGIN e ISO_PRO_E2E_SENHA para correr este teste.');

  const loginUrl = new URL('/#/login', baseURL!).toString();
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });

  if (e2eTenant) {
    const tenantSelect = page.locator('[data-e2e="login-tenant"]');
    if (await tenantSelect.count()) {
      await tenantSelect.selectOption(e2eTenant);
    }
  }

  await page.locator('[data-e2e="login-usuario"]').fill(e2eLogin!);
  await page.locator('[data-e2e="login-senha"]').fill(e2eSenha!);
  await page.locator('[data-e2e="login-submit"]').click();

  await expect(page.locator('[data-e2e="app-root"]')).toBeAttached({ timeout: 60_000 });
  await expect(page).not.toHaveURL(/#\/login$/);
});
