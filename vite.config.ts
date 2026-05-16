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
export default defineConfig({
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
    open: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**', 'src/**/*.integration.test.ts'],
    reporters: process.env.GITHUB_ACTIONS ? ['default', 'github-actions'] : ['default'],
  },
})
