/**
 * E2E opcional: login staging + navega listas escala (PC/web).
 * Skip sem ISO_PRO_E2E_LOGIN / ISO_PRO_E2E_SENHA.
 *
 *   ISO_PRO_E2E_PREVIEW=1 npm run test:e2e -- e2e/escala-listas-staging.spec.ts
 * (build com env staging: copie .env.staging → .env.production.local antes do build, ou
 *  sirva `npx vite --mode staging` e aponte Playwright baseURL.)
 */
import { expect, test } from '@playwright/test';

const e2eLogin = process.env.ISO_PRO_E2E_LOGIN?.trim();
const e2eSenha = process.env.ISO_PRO_E2E_SENHA?.trim();
const e2eTenant = process.env.ISO_PRO_E2E_TENANT_ID?.trim();

const routes = [
  { path: '/#/documentos', name: 'documentos' },
  { path: '/#/recebimentos', name: 'recebimentos' },
  { path: '/#/materiais', name: 'materiais' },
  { path: '/#/atendimento', name: 'atendimento' },
  { path: '/#/rir', name: 'rir' },
  { path: '/#/rnc', name: 'rnc' },
  { path: '/#/relatorios/final-obra', name: 'relatorio-final' },
];

async function loginAndOpenRoutes(page, baseURL) {
  test.setTimeout(180_000);
  const loginUrl = new URL('/#/login', baseURL!).toString();
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
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

  // Se MFA enroll aparecer (admin), falha clara — user e2e deve ser perfil operação.
  const mfaEnroll = page.locator('[data-e2e="login-mfa-enroll-code"]');
  if (await mfaEnroll.isVisible({ timeout: 3_000 }).catch(() => false)) {
    throw new Error('MFA enroll inesperado — re-corra bootstrap-e2e-staging-user.mjs (perfil operacao).');
  }
  const mfaCode = page.locator('[data-e2e="login-mfa-code"]');
  if (await mfaCode.isVisible({ timeout: 2_000 }).catch(() => false)) {
    throw new Error('MFA challenge inesperado para user e2e.');
  }

  await expect(page).not.toHaveURL(/#\/login$/, { timeout: 90_000 });
  const loginErr = page.locator('[data-e2e="login-error"]');
  if (await loginErr.isVisible().catch(() => false)) {
    throw new Error(`Login falhou: ${await loginErr.textContent()}`);
  }

  for (const r of routes) {
    await page.goto(new URL(r.path, baseURL!).toString(), { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-e2e="app-root"]')).toBeAttached({ timeout: 30_000 });
    await expect(page.locator('text=Something went wrong')).toHaveCount(0);
    await expect(page.locator('text=Application Error')).toHaveCount(0);
    await page.waitForTimeout(1500);
    console.log(`OK route ${r.name}`);
  }
}

test.describe('escala listas staging (opcional)', () => {
  test.skip(!e2eLogin || !e2eSenha, 'Defina ISO_PRO_E2E_LOGIN e ISO_PRO_E2E_SENHA');

  test('login e abre listas principais sem erro fatal', async ({ page, baseURL }) => {
    await loginAndOpenRoutes(page, baseURL);
  });
});
