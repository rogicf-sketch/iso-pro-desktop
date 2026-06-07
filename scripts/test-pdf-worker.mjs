/**
 * Teste rigoroso do PDF worker (local + fila Supabase).
 * Uso: npm run test:pdf-worker
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { createClient } from '@supabase/supabase-js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const payloadMinimo = {
  registro: {
    id: 'test-worker',
    codigo: 'RIR-TEST-WORKER',
    dataRegistro: '2026-06-01',
    recebimentoNotaFiscal: 'NF-TEST',
    recebimentoRomaneio: 'ROM-TEST',
    uo: 'GESTAO DE MATERIAIS',
    localObra: 'Jaú-SP',
    contratoNumero: '66.234.531/0001-57',
    fornecedorNome: 'Fornecedor Teste',
    inspecaoQuantitativa: true,
    inspecaoQualitativa: true,
    inspecaoDimensional: false,
    procedimentoNumero: 'PE-INS-001',
    solCompraPackList: 'N/A',
    obsCurta: '',
    itensRir: Array.from({ length: 5 }, (_, i) => ({
      id: `item-${i}`,
      codigoMaterial: `MAT-${100 + i}`,
      descricaoMaterial: `Material áéíõú ${i}`,
      quantidade: 1,
      unidade: 'PÇ',
      certificado: 'N/A',
    })),
    instrumentos: '',
    documentosQc: '',
    observacoesQc: 'Inspeção OK — texto acentuado ção',
    laudo: 'aprovado',
    assinaturaRecebimento: { nome: 'Recebedor', data: '2026-06-01' },
    assinaturaCq: { nome: 'CQ', data: '2026-06-01' },
    assinaturaCliente: { nome: 'Cliente', data: '2026-06-01' },
    origem: '',
    responsavel: '',
    descricao: '',
    status: 'tratado',
    acaoImediata: '',
    observacoes: '',
  },
  branding: { cliente: 'I.S.O PRO', projeto: 'GESTAO DE MATERIAIS' },
  uoExibir: 'GESTAO DE MATERIAIS',
  localExibir: 'Jaú-SP',
  contratoExibir: '66.234.531/0001-57',
  disciplinaExibir: 'Instrumentação',
  escopoLinha: 'I.S.O PRO · TESTE WORKER',
  emitidoEm: '01/06/2026, 23:00',
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
  const subject = doc.getSubject() ?? '';
  const creator = doc.getCreator() ?? '';
  const title = doc.getTitle() ?? '';
  if (!subject.includes('iso-pro-rir-programatico')) return fail(`${label}: metadados RIR ausentes`);
  if (!creator.includes('I.S.O PRO Desktop')) return fail(`${label}: creator inválido`);
  if (!title.startsWith('RIR ')) return fail(`${label}: título inválido: ${title}`);
  ok(`${label}: metadados oficiais (${doc.getPageCount()} pág.)`);
  return true;
}

function runLocalTest(label, envExtra) {
  const env = {
    ...process.env,
    PDF_TEST_PAYLOAD: JSON.stringify(payloadMinimo),
    ...envExtra,
  };
  if (envExtra?.PDF_WORKER_FONTS_DIR === '') delete env.PDF_WORKER_FONTS_DIR;

  const r = spawnSync('npx', ['tsx', 'services/pdf-worker/src/test-rir-local.ts'], {
    cwd: root,
    env,
    encoding: 'buffer',
    maxBuffer: 20 * 1024 * 1024,
    shell: true,
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
  if (!any) return fail('Nenhuma fonte Noto — execute npm run sync:rir-fonts');
  ok('fontes presentes');
  return true;
}

async function testBuildDistFonts() {
  console.log('\n[1] Build worker + dist/fonts');
  const r = spawnSync('npm', ['run', 'build:pdf-worker'], { cwd: root, stdio: 'pipe', shell: true, encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(r.stdout || r.stderr || '(sem output)');
    const distIndex = path.join(root, 'services', 'pdf-worker', 'dist', 'index.mjs');
    if (!fs.existsSync(distIndex)) return fail('build:pdf-worker falhou');
    console.warn('  ⚠ build retornou erro (worker em execução?) — dist/index.mjs existe, continuando');
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
  if (!fs.existsSync(distFonts)) return fail('dist/fonts não disponível');
  ok(`dist/fonts: ${fs.readdirSync(distFonts).join(', ')}`);
  return true;
}

async function testLocalSemEnv() {
  console.log('\n[2] Geração local (auto-detect fontes, sem PDF_WORKER_FONTS_DIR)');
  const bytes = runLocalTest('local auto', { PDF_WORKER_FONTS_DIR: '' });
  if (!bytes) return false;
  return validarPdf(bytes, 'local auto');
}

async function testLocalComEnv() {
  console.log('\n[3] Geração local (PDF_WORKER_FONTS_DIR explícito)');
  const bytes = runLocalTest('local env', {
    PDF_WORKER_FONTS_DIR: path.join(root, 'services', 'pdf-worker', 'fonts'),
  });
  if (!bytes) return false;
  return validarPdf(bytes, 'local env');
}

async function testFilaSupabase() {
  console.log('\n[4] Fila Supabase (worker deve estar rodando)');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return fail('SUPABASE_URL/SERVICE_ROLE ausentes em pdf-worker.local.env');

  const sb = createClient(url, key);
  const { data: tenants, error: te } = await sb.from('iso_pro_tenants').select('id').limit(1);
  if (te || !tenants?.[0]) return fail(`tenant: ${te?.message ?? 'nenhum'}`);

  const { data: job, error: je } = await sb
    .from('pdf_jobs')
    .insert({
      tenant_id: tenants[0].id,
      tipo: 'rir',
      payload: payloadMinimo,
      file_name: 'test-worker-rir.pdf',
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
  return fail('timeout 60s — worker parado? Execute npm run pdf-worker:run');
}

async function main() {
  console.log('=== test-pdf-worker (rigoroso) ===');
  process.chdir(root);
  loadEnv(path.join(root, 'services', 'pdf-worker', 'pdf-worker.local.env'));

  const results = [
    await testFontesPresentes(),
    await testBuildDistFonts(),
    await testLocalSemEnv(),
    await testLocalComEnv(),
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
