import { expect, test } from '@playwright/test';

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
