import { expect, test } from '@playwright/test';

test('página inicial carrega (título I.S.O PRO)', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/I\.S\.O PRO/);
  await expect(page.locator('[data-e2e="app-root"]')).toBeAttached();
  // #root pode não ter altura própria; validar UI hidratada (login ou gate desktop).
  await expect(
    page
      .getByRole('heading', { name: 'Entrar' })
      .or(page.getByText(/Validando seguranca da instalacao desktop/i)),
  ).toBeVisible({ timeout: 30_000 });
});
