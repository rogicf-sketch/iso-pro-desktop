import { expect, test } from '@playwright/test';

test('página de login carrega (hash router)', async ({ page }) => {
  // A app usa createHashRouter — sem #/login a rota protegida não hidrata o ecrã de entrada.
  await page.goto('/#/login');
  await expect(page).toHaveTitle(/I\.S\.O PRO/);
  await expect(page.locator('[data-e2e="app-root"]')).toBeAttached();
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible({ timeout: 30_000 });
});
