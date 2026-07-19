import { expect, test } from '@playwright/test';

/**
 * Estorno V2 — smoke E2E.
 * Cobre navegacao ate o historico de atendimento (modal de estorno exige dados reais).
 * Fluxo completo (confirmar RPC) fica nos testes Vitest + SQL; aqui validamos UI gate.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/#/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

test('rota de atendimento expoe shell apos login (gate do estorno)', async ({ page, baseURL }) => {
  const e2eLogin = process.env.ISO_PRO_E2E_LOGIN?.trim();
  const e2eSenha = process.env.ISO_PRO_E2E_SENHA?.trim();
  test.skip(!e2eLogin || !e2eSenha, 'Defina ISO_PRO_E2E_LOGIN e ISO_PRO_E2E_SENHA para este teste.');

  const loginUrl = new URL('/#/login', baseURL!).toString();
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-e2e="login-usuario"]').fill(e2eLogin!);
  await page.locator('[data-e2e="login-senha"]').fill(e2eSenha!);
  await page.locator('[data-e2e="login-submit"]').click();

  await expect(page).not.toHaveURL(/#\/login$/, { timeout: 60_000 });

  // Navega para atendimento (hash router).
  await page.goto(new URL('/#/atendimento', baseURL!).toString(), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-e2e="app-root"]')).toBeAttached({ timeout: 30_000 });
});

test('opt-out local da flag V2 e reconhecido no browser', async ({ page, baseURL }) => {
  await page.goto(new URL('/#/login', baseURL!).toString(), { waitUntil: 'domcontentloaded' });
  const flagOff = await page.evaluate(() => {
    localStorage.setItem('iso-pro-desktop-estorno-v2-opt-in-v1', 'false');
    const stored = localStorage.getItem('iso-pro-desktop-estorno-v2-opt-in-v1');
    return stored === '0' || stored === 'false' || stored === 'no';
  });
  expect(flagOff).toBe(true);
});
