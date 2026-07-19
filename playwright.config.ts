import { defineConfig, devices } from '@playwright/test';

/**
 * E2E web (Vite mode `e2e` + mock auth).
 * Electron não é arrancado — regressões no HTML/React base + fluxo login→módulo.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  reporter:
    process.env.ISO_PRO_E2E_PREVIEW === '1'
      ? [['github'], ['html', { open: 'never' }]]
      : process.env.CI
        ? 'github'
        : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    actionTimeout: 15_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Nightly com secrets: ISO_PRO_E2E_PREVIEW=1 serve o build de produção (DEV=false,
    // sem mock auth) para exercer o login real contra o Supabase. Caso contrário usa o
    // servidor de dev em modo `e2e` (mock auth) para os smokes de PR/push.
    command: process.env.ISO_PRO_E2E_PREVIEW === '1'
      ? 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort'
      : 'npx vite --mode e2e --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
