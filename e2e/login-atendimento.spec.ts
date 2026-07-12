import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/#/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

/**
 * Fluxo real (CI): mock auth local → Atendimento.
 * Requer vite --mode e2e (VITE_ENABLE_LOCAL_MOCK_AUTH + VITE_DISABLE_DEV_AUTO_LOGIN via .env.e2e).
 */
test('login mock e abre modulo Atendimento', async ({ page, baseURL }) => {
  const loginUrl = new URL('/#/login', baseURL!).toString();
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-e2e="login-title"]')).toHaveText('Entrar', { timeout: 45_000 });

  await page.locator('[data-e2e="login-usuario"]').fill('admin');
  await page.locator('[data-e2e="login-senha"]').fill('admin');
  await page.locator('[data-e2e="login-submit"]').click();

  await expect(page).not.toHaveURL(/#\/login$/, { timeout: 30_000 });
  await expect(page.locator('[data-e2e="app-root"]')).toBeAttached();

  await page.goto(new URL('/#/atendimento', baseURL!).toString(), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-e2e="atendimento-page"]')).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('[data-e2e="atendimento-title"]')).toHaveText('Atendimento');
});

const e2eLogin = process.env.ISO_PRO_E2E_LOGIN?.trim();
const e2eSenha = process.env.ISO_PRO_E2E_SENHA?.trim();
const e2eTenant = process.env.ISO_PRO_E2E_TENANT_ID?.trim();

test('login remoto staging e abre Atendimento (opcional)', async ({ page, baseURL }) => {
  test.skip(!e2eLogin || !e2eSenha, 'Defina ISO_PRO_E2E_LOGIN e ISO_PRO_E2E_SENHA para staging.');

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

  await expect(page).not.toHaveURL(/#\/login$/, { timeout: 60_000 });
  await page.goto(new URL('/#/atendimento', baseURL!).toString(), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-e2e="atendimento-page"]')).toBeVisible({ timeout: 60_000 });
});
