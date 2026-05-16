import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/** Suíte opcional: HTTP direto às Edge Functions (ver `src/test/edgeFunctions.integration.test.ts`). */
export default defineConfig({
  root: dirname,
  test: {
    environment: 'node',
    include: ['src/test/**/*.integration.test.ts'],
    reporters: ['default'],
    testTimeout: 20_000,
  },
});
