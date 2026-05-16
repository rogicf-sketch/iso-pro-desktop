import { expect, test } from '@playwright/test';

test('página inicial carrega (título I.S.O PRO)', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/I\.S\.O PRO/);
  await expect(page.locator('[data-e2e="app-root"]')).toBeVisible();
});
