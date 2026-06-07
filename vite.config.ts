import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const packageJsonPath = fileURLToPath(new URL('./package.json', import.meta.url))
const appVersion = (JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version: string }).version

// https://vite.dev/config/
// base relativo: necessário para Electron carregar JS/CSS com loadFile (protocolo file://).
export default defineConfig(({ mode }) => {
  if (mode === 'production' && process.env.VITE_ENABLE_LOCAL_MOCK_AUTH === 'true') {
    throw new Error(
      'Build de producao bloqueado: remova VITE_ENABLE_LOCAL_MOCK_AUTH=true do ambiente de build.',
    );
  }

  return {
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      ...(process.env.VITEST === 'true'
        ? { '@sentry/react': path.resolve(__dirname, './src/test/sentry-react.mock.ts') }
        : {}),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    /** Não abrir browser extra — `npm run dev` usa janela Electron. Use `npm run dev:browser` para abrir no Chrome. */
    open: process.env.VITE_OPEN_BROWSER === '1',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**', 'src/**/*.integration.test.ts'],
    reporters: process.env.GITHUB_ACTIONS ? ['default', 'github-actions'] : ['default'],
  },
};
})
