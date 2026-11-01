/**
 * Prova dos caminhos de cliente (PC/web/mobile) a volume enterprise — staging ONLY.
 * Simula o que a UI faz: páginas sucessivas, busca, offset profundo, detalhe pontual,
 * payload RIR pronto para PDF, agregados de relatório (operacao_contagens).
 *
 * Não substitui clique humano, mas fecha a lacuna “lista a 200k sem travar o contrato”.
 *
 *   node --use-system-ca scripts/load-test-client-paths-enterprise.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLoadTestStagingOnly } from './load-test-staging-guard.mjs';
import { createClient } from '@supabase/supabase-js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
function loadEnvFile(name) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnvFile('.env.staging');

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.ISO_PRO_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;
const tenant =
  process.env.SUPABASE_TENANT_ID ||
  process.env.VITE_ISO_PRO_TENANT_ID ||
  '00000000-0000-0000-0000-000000000001';

assertLoadTestStagingOnly(url);
if (!url || !key) {
  console.error('Faltam URL/KEY staging.');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const results = [];
const BUDGET_MS = {
  page: 8_000,
  search: 12_000,
  deep: 15_000,
  detail: 5_000,
  report: 20_000,
};

function push(label, ok, ms, detail) {
  results.push({ label, ok, ms, detail });
  console.log(`${ok ? 'OK' : 'FAIL'} ${label}: ${ms}ms ${detail ?? ''}`);
}

async function timed(fn) {
  const t0 = performance.now();
  try {
    const data = await fn();
    return { data, error: null, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return {
      data: null,
      error: e instanceof Error ? e.message : String(e),
      ms: Math.round(performance.now() - t0),
    };
  }
}

async function rpc(name, params) {
  const { data, error } = await sb.rpc(name, params);
  if (error) throw new Error(error.message);
  return data;
}

console.log('=== Client paths enterprise (PC/web/mobile contract) ===');
console.log(`host=${new URL(url).hostname}`);

// --- PC/Web/Mobile: scroll de páginas (como virtual list) ---
{
  const pages = [0, 50, 500, 5000, 50000];
  for (const offset of pages) {
    const { data, error, ms } = await timed(() =>
      rpc('iso_pro_list_documentos_planejamento_page', {
        p_tenant_id: tenant,
        p_busca: null,
        p_offset: offset,
        p_limit: 50,
        p_status: 'todos',
      }),
    );
    const n = Array.isArray(data?.documentos) ? data.documentos.length : 0;
    const total = Number(data?.total) || 0;
    const expectRows = offset < total ? Math.min(50, total - offset) : 0;
    push(
      `ui-scroll docs offset=${offset}`,
      !error && n === expectRows && ms <= BUDGET_MS.page,
      ms,
      error ?? `rows=${n} total=${total}`,
    );
  }
}

// --- Filtro/busca (UI search box) ---
{
  const { data, error, ms } = await timed(() =>
    rpc('iso_pro_list_documentos_planejamento_page', {
      p_tenant_id: tenant,
      p_busca: 'E.LOAD100K-000001',
      p_offset: 0,
      p_limit: 20,
      p_status: 'todos',
    }),
  );
  const n = Array.isArray(data?.documentos) ? data.documentos.length : 0;
  push(
    'ui-search docs',
    !error && n >= 1 && ms <= BUDGET_MS.search,
    ms,
    error ?? `rows=${n}`,
  );
}

{
  const { data, error, ms } = await timed(() =>
    rpc('iso_pro_list_materiais_page', {
      p_tenant_id: tenant,
      p_busca: 'LOAD100K-M-00001',
      p_offset: 0,
      p_limit: 20,
      p_disciplina: null,
      p_ativo: null,
    }),
  );
  const n = Array.isArray(data?.materiais) ? data.materiais.length : 0;
  push(
    'ui-search materiais',
    !error && n >= 1 && ms <= BUDGET_MS.search,
    ms,
    error ?? `rows=${n}`,
  );
}

{
  const { data, error, ms } = await timed(() =>
    rpc('iso_pro_list_atendimento_lotes', {
      p_tenant_id: tenant,
      p_limit: 20,
      p_offset: 0,
      p_q: 'LOADENT-ATD-000001',
      p_desde: null,
    }),
  );
  const items = data?.atendimentos ?? data?.items ?? [];
  const n = Array.isArray(items) ? items.length : 0;
  push(
    'ui-search atendimento (mobile+PC)',
    !error && n >= 1 && ms <= BUDGET_MS.search,
    ms,
    error ?? `rows=${n}`,
  );
}

{
  const { data, error, ms } = await timed(() =>
    rpc('iso_pro_list_rir_page', {
      p_tenant_id: tenant,
      p_busca: 'RIR-LOAD-000001',
      p_offset: 0,
      p_limit: 10,
      p_status: null,
    }),
  );
  const n = Array.isArray(data?.registros) ? data.registros.length : 0;
  push(
    'ui-search rir (PC/web)',
    !error && n >= 1 && ms <= BUDGET_MS.search,
    ms,
    error ?? `rows=${n}`,
  );
}

// --- Mobile-shaped: página curta + deep offset recebimentos ---
{
  const { data, error, ms } = await timed(() =>
    rpc('iso_pro_list_recebimentos_page', {
      p_tenant_id: tenant,
      p_busca: null,
      p_offset: 0,
      p_limit: 50,
      p_status: null,
      p_modo: null,
    }),
  );
  const n = Array.isArray(data?.recebimentos) ? data.recebimentos.length : 0;
  push(
    'mobile-page recebimentos limit=50',
    !error && n === 50 && ms <= BUDGET_MS.page * 2,
    ms,
    error ?? `rows=${n} total=${data?.total}`,
  );
}

{
  const { data, error, ms } = await timed(() =>
    rpc('iso_pro_list_recebimentos_page', {
      p_tenant_id: tenant,
      p_busca: null,
      p_offset: 90000,
      p_limit: 50,
      p_status: null,
      p_modo: null,
    }),
  );
  const n = Array.isArray(data?.recebimentos) ? data.recebimentos.length : 0;
  push(
    'mobile-scroll deep recebimentos',
    !error && n >= 1 && ms <= BUDGET_MS.deep,
    ms,
    error ?? `rows=${n}`,
  );
}

// --- Offline policy constants (mobile source of truth) ---
{
  const politicas = path.join(
    root,
    '..',
    'iso_pro_mobile',
    'src',
    'lib',
    'atendimentoFilaPolitica.ts',
  );
  const escala = path.join(root, '..', 'iso_pro_mobile', 'src', 'lib', 'escalaDomainWrite.ts');
  let ok = true;
  let detail = '';
  try {
    const p = fs.readFileSync(politicas, 'utf8');
    const e = fs.readFileSync(escala, 'utf8');
    const has24 = /ATENDIMENTO_FILA_AVISO_HORAS\s*=\s*24/.test(p);
    const has48 = /ATENDIMENTO_FILA_BLOQUEIO_HORAS\s*=\s*48/.test(p);
    const has72 = /72\s*\*\s*60\s*\*\s*60\s*\*\s*1000|MAX_QUEUE_AGE/.test(e);
    ok = has24 && has48 && has72;
    detail = `warn24=${has24} block48=${has48} escala72=${has72}`;
  } catch (err) {
    ok = false;
    detail = err instanceof Error ? err.message : String(err);
  }
  push('mobile-offline policy constants', ok, 0, detail);
}

// --- Relatório / PDF readiness: RIR payload + painel ---
{
  const { data, error, ms } = await timed(() =>
    rpc('iso_pro_list_rir_page', {
      p_tenant_id: tenant,
      p_busca: null,
      p_offset: 0,
      p_limit: 5,
      p_status: null,
    }),
  );
  const rows = Array.isArray(data?.registros) ? data.registros : [];
  const sample = rows[0] ?? {};
  const ready =
    sample &&
    typeof sample === 'object' &&
    (sample.codigo || sample.id) &&
    (sample.recebimentoId || sample.recebimentoNotaFiscal || sample.descricao);
  push(
    'report-rir payload for PDF',
    !error && ready && ms <= BUDGET_MS.report,
    ms,
    error ?? `codigo=${sample.codigo ?? sample.id}`,
  );
}

{
  const { data, error, ms } = await timed(() =>
    rpc('iso_pro_operacao_contagens', { p_tenant_id: tenant }),
  );
  const has =
    data &&
    typeof data === 'object' &&
    !data._error &&
    ('documentosTotal' in data ||
      'docsTotal' in data ||
      'rirAbertos' in data ||
      'rncAbertas' in data ||
      Object.keys(data).length >= 5);
  push(
    'report-painel operacao_contagens',
    !error && Boolean(has) && ms <= BUDGET_MS.report,
    ms,
    error ?? `keys=${data ? Object.keys(data).slice(0, 8).join(',') : ''}`,
  );
}

{
  const { data, error, ms } = await timed(() =>
    rpc('iso_pro_sum_metricas_planejamento_por_codigo', {
      p_tenant_id: tenant,
      p_codigos: ['LOAD100K-M-00001', 'LOAD100K-M-00002', 'LOAD100K-M-00003'],
    }),
  );
  const codes = data?.porCodigo ? Object.keys(data.porCodigo).length : 0;
  push(
    'report-metricas p_codigos (folha UI)',
    !error && codes >= 1 && ms <= BUDGET_MS.page,
    ms,
    error ?? `codes=${codes} filtered=${data?._filtered}`,
  );
}

console.log('\n--- resumo client paths ---');
const pass = results.filter((r) => r.ok).length;
const total = results.length;
const rate = total ? pass / total : 0;
console.log(`pass=${pass}/${total} (${(rate * 100).toFixed(1)}%)`);
const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.error(
    'Falhas:',
    failed.map((f) => `${f.label} (${f.detail})`).join(' | '),
  );
}
if (rate < 0.95) {
  console.error('ACEITE NÃO ATINGIDO (<95%).');
  process.exit(2);
}
console.log('ACEITE ≥95%: caminhos PC/web/mobile + relatório OK.');
process.exit(0);
