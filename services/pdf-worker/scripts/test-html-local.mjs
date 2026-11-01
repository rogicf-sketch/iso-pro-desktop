/**
 * Geração local HTML→PDF (sem tsx) — smoke do contrato HTML-first.
 * Env: PDF_TEST_PAYLOAD = JSON { html, waitPagedJs? }
 */
import { chromium } from 'playwright';

const raw = process.env.PDF_TEST_PAYLOAD ?? '{}';
let payload;
try {
  payload = JSON.parse(raw);
} catch {
  console.error('PDF_TEST_PAYLOAD JSON inválido');
  process.exit(1);
}

const html = typeof payload.html === 'string' ? payload.html : '';
if (!html.trim()) {
  console.error('Payload sem html');
  process.exit(1);
}

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--font-render-hinting=none', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load', timeout: 60_000 });
  const pdfBuffer = await page.pdf({
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });
  process.stdout.write(Buffer.from(pdfBuffer));
  process.stderr.write(`\n[test-html-local] ${pdfBuffer.length} bytes\n`);
} finally {
  await browser.close().catch(() => undefined);
}
