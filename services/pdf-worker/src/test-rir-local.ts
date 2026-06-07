/**
 * Geração local RIR no worker (sem fila). Invocado por scripts/test-pdf-worker.mjs
 */
import { gerarRirPdfFromPayload } from './handlers/rir.ts';

const payload = JSON.parse(process.env.PDF_TEST_PAYLOAD ?? '{}');

if (!payload.registro) {
  console.error('PDF_TEST_PAYLOAD inválido');
  process.exit(1);
}

const bytes = await gerarRirPdfFromPayload(payload);
process.stdout.write(Buffer.from(bytes));
process.stderr.write(`\n[test-rir-local] ${bytes.length} bytes\n`);
