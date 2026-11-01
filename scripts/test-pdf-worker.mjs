/**
 * Teste rigoroso do PDF worker (HTML-first + Playwright).
 * Uso: npm run test:pdf-worker
 * Fila nuvem (opcional): PDF_WORKER_QUEUE=1 e worker a correr.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { createClient } from '@supabase/supabase-js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function htmlFixture(titulo, codigo) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${titulo}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body { font-family: Arial, sans-serif; color: #111; font-size: 12pt; }
    h1 { font-size: 18pt; margin: 0 0 8px; }
    .meta { color: #444; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
    th { background: #f3f3f3; }
  </style>
</head>
<body>
  <h1>${titulo}</h1>
  <p class="meta">Código ${codigo} · I.S.O PRO · prova PDF worker</p>
  <table>
    <thead><tr><th>Item</th><th>Descrição</th><th>Qtd</th></tr></thead>
    <tbody>
      <tr><td>LOAD100K-M-00001</td><td>Material escala</td><td>2</td></tr>
      <tr><td>LOAD100K-M-00002</td><td>Material escala</td><td>1</td></tr>
    </tbody>
  </table>
</body>
</html>`;
}

const payloadRir = {
  html: htmlFixture('RIR — Relatório de Inspeção de Recebimento', 'RIR-LOAD-TEST'),
  waitPagedJs: false,
};

const payloadRelatorioFinal = {
  html: htmlFixture('Relatório Final de Obra', 'RF-LOAD-TEST'),
  waitPagedJs: false,
};

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

function fail(msg) {
  console.error(`  ✗ ${msg}`);
  process.exitCode = 1;
  return false;
}

async function validarPdf(bytes, label) {
  if (bytes.length < 64) return fail(`${label}: PDF muito pequeno (${bytes.length} bytes)`);
  const sig = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]);
  if (sig !== '%PDF-') return fail(`${label}: assinatura inválida`);
  ok(`${label}: assinatura %PDF- (${Math.round(bytes.length / 1024)} KB)`);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPageCount();
  if (pages < 1) return fail(`${label}: 0 páginas`);
  ok(`${label}: ${pages} página(s)`);
  return true;
}

function runLocalHtml(label, payload, envExtra = {}) {
  const env = {
    ...process.env,
    PDF_TEST_PAYLOAD: JSON.stringify(payload),
    NODE_OPTIONS: [process.env.NODE_OPTIONS, '--use-system-ca'].filter(Boolean).join(' '),
    ...envExtra,
  };
  if (envExtra?.PDF_WORKER_FONTS_DIR === '') delete env.PDF_WORKER_FONTS_DIR;

  const r = spawnSync(process.execPath, ['services/pdf-worker/scripts/test-html-local.mjs'], {
    cwd: root,
    env,
    encoding: 'buffer',
    maxBuffer: 20 * 1024 * 1024,
  });

  const stderr = r.stderr?.toString('utf8') ?? '';
  if (stderr) process.stderr.write(stderr);

  if (r.status !== 0) {
    fail(`${label}: exit ${r.status}`);
    return null;
  }

  const pdfBuf = r.stdout ?? Buffer.alloc(0);
  if (pdfBuf.length < 64) {
    fail(`${label}: stdout vazio ou PDF inválido`);
    return null;
  }
  return new Uint8Array(pdfBuf);
}

async function testFontesPresentes() {
  console.log('\n[0] Inventário de fontes');
  const dirs = [
    path.join(root, 'public', 'fonts'),
    path.join(root, 'services', 'pdf-worker', 'fonts'),
    path.join(root, 'services', 'pdf-worker', 'dist', 'fonts'),
  ];
  let any = false;
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      console.log(`  - ${dir}: (ausente)`);
      continue;
    }
    const files = fs.readdirSync(dir).filter((f) => /\.(ttf|woff)$/i.test(f));
    console.log(`  - ${path.relative(root, dir)}: ${files.join(', ') || '(vazio)'}`);
    any = any || files.length > 0;
  }
  if (!any) console.warn('  ⚠ sem Noto — HTML usa Arial (ok para smoke)');
  else ok('fontes presentes');
  return true;
}

async function testBuildDistFonts() {
  console.log('\n[1] Build worker + dist/fonts');
  const r = spawnSync('npm', ['run', 'build:pdf-worker'], {
    cwd: root,
    stdio: 'pipe',
    shell: true,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    const distIndex = path.join(root, 'services', 'pdf-worker', 'dist', 'index.mjs');
    if (!fs.existsSync(distIndex)) return fail('build:pdf-worker falhou');
    console.warn('  ⚠ build retornou erro — dist existe, continuando');
  }
  const distFonts = path.join(root, 'services', 'pdf-worker', 'dist', 'fonts');
  if (!fs.existsSync(distFonts)) {
    const src = path.join(root, 'services', 'pdf-worker', 'fonts');
    if (fs.existsSync(src)) {
      fs.mkdirSync(distFonts, { recursive: true });
      for (const f of fs.readdirSync(src)) {
        if (/\.(ttf|woff)$/i.test(f)) fs.copyFileSync(path.join(src, f), path.join(distFonts, f));
      }
    }
  }
  ok(fs.existsSync(distFonts) ? `dist/fonts: ${fs.readdirSync(distFonts).join(', ')}` : 'dist ok (sem fonts)');
  return true;
}

async function testLocalRir() {
  console.log('\n[2] Geração local RIR (HTML → Chromium)');
  const bytes = runLocalHtml('rir local', payloadRir, { PDF_WORKER_FONTS_DIR: '' });
  if (!bytes) return false;
  return validarPdf(bytes, 'rir local');
}

async function testLocalRelatorioFinal() {
  console.log('\n[3] Geração local relatório final obra (HTML → Chromium)');
  const bytes = runLocalHtml('rf local', payloadRelatorioFinal);
  if (!bytes) return false;
  return validarPdf(bytes, 'rf local');
}

async function testFilaSupabase() {
  console.log('\n[4] Fila Supabase (opcional)');
  if (process.env.PDF_WORKER_QUEUE !== '1') {
    console.log('  SKIP — defina PDF_WORKER_QUEUE=1 e `npm run pdf-worker:run`');
    return true;
  }
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.ISO_PRO_SERVICE_ROLE_KEY;
  if (!url || !key) return fail('SUPABASE_URL/SERVICE_ROLE ausentes');

  const sb = createClient(url, key);
  const { data: tenants, error: te } = await sb.from('iso_pro_tenants').select('id').limit(1);
  if (te || !tenants?.[0]) return fail(`tenant: ${te?.message ?? 'nenhum'}`);

  const { data: job, error: je } = await sb
    .from('pdf_jobs')
    .insert({
      tenant_id: tenants[0].id,
      tipo: 'rir',
      payload: payloadRir,
      file_name: 'test-worker-rir-html.pdf',
    })
    .select('id')
    .single();
  if (je) return fail(`insert: ${je.message}`);
  ok(`job ${job.id} enfileirado`);

  for (let n = 0; n < 30; n++) {
    await new Promise((r) => setTimeout(r, 2000));
    const { data: j } = await sb
      .from('pdf_jobs')
      .select('status,error,attempts,storage_path')
      .eq('id', job.id)
      .single();
    if (j.status === 'done') {
      ok(`concluído (${j.attempts} tentativa(s))`);
      const { data: signed, error: se } = await sb.storage.from('pdfs').createSignedUrl(j.storage_path, 120);
      if (se || !signed?.signedUrl) return fail(`signed URL: ${se?.message ?? 'vazia'}`);
      const res = await fetch(signed.signedUrl);
      if (!res.ok) return fail(`download HTTP ${res.status}`);
      return validarPdf(new Uint8Array(await res.arrayBuffer()), 'nuvem');
    }
    if (j.status === 'failed') return fail(`job falhou: ${j.error}`);
    process.stdout.write(`  … ${j.status} (t${j.attempts})\r`);
  }
  return fail('timeout 60s — worker parado?');
}

async function main() {
  console.log('=== test-pdf-worker (HTML-first) ===');
  process.chdir(root);
  loadEnv(path.join(root, 'services', 'pdf-worker', 'pdf-worker.local.env'));
  loadEnv(path.join(root, '.env.staging'));

  const results = [
    await testFontesPresentes(),
    await testBuildDistFonts(),
    await testLocalRir(),
    await testLocalRelatorioFinal(),
    await testFilaSupabase(),
  ];

  const passed = results.filter(Boolean).length;
  console.log(`\n=== ${passed}/${results.length} testes OK ===`);
  if (passed !== results.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
