#!/usr/bin/env node
/**
 * Simula o fluxo do leitor de código de barras (sem USB) e mede cada etapa.
 *
 * Espelha o caminho actual do PC:
 *   bip → material (query indexada) → docs pendentes por código → (opcional) aquecer saldo
 *   confirmar → ler desenho → submit comando
 *
 * Também cronometra caminhos antigos/pesados (lista completa de materiais, fatia
 * recebimentos) para mostrar de onde vinham ~40s.
 *
 * Uso:
 *   node scripts/run-load-on-staging.mjs -- scripts/bench-atendimento-bip.mjs
 *   node scripts/bench-atendimento-bip.mjs --codigo PARSSB0P.10 --rounds 5 --write
 *   BIP_CODIGO=... --no-write   (só leituras)
 */
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
function hasFlag(name) {
  return args.includes(name);
}

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '';
const TENANT_ID =
  process.env.SUPABASE_TENANT_ID ??
  process.env.VITE_ISO_PRO_TENANT_ID ??
  '00000000-0000-0000-0000-000000000001';
const ROUNDS = Math.max(1, Number(arg('--rounds', process.env.BIP_BENCH_ROUNDS ?? '5')));
const DO_WRITE = hasFlag('--write') || process.env.BIP_BENCH_WRITE === '1';
const SKIP_HEAVY = hasFlag('--skip-heavy');
let CODIGO = (arg('--codigo', process.env.BIP_CODIGO ?? '') || '').trim();

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Defina SUPABASE_URL e SUPABASE_ANON_KEY (ou .env.staging via run-load-on-staging).');
  process.exit(1);
}

if (process.env.ISO_PRO_JWT_SKIP_TLS_VERIFY === '1') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

async function time(label, fn) {
  const t0 = performance.now();
  try {
    const result = await fn();
    const ms = Math.round(performance.now() - t0);
    return { label, ok: true, ms, result, error: null };
  } catch (e) {
    const ms = Math.round(performance.now() - t0);
    return { label, ok: false, ms, result: null, error: e instanceof Error ? e.message : String(e) };
  }
}

function pct(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

function summarize(samples) {
  const ok = samples.filter((s) => s.ok);
  const ms = ok.map((s) => s.ms).sort((a, b) => a - b);
  return {
    n: samples.length,
    ok: ok.length,
    err: samples.length - ok.length,
    p50: pct(ms, 50),
    p95: pct(ms, 95),
    max: ms.length ? ms[ms.length - 1] : 0,
  };
}

async function pickCodigoComPendente() {
  // Prefer material with pending qty on a real desenho.
  const { data: linhas, error } = await supabase
    .from('iso_pro_documento_itens_planejamento')
    .select('codigo,quantidade,quantidade_atendida')
    .eq('tenant_id', TENANT_ID)
    .limit(800);
  if (error) throw new Error(error.message);
  for (const l of linhas ?? []) {
    const q = Number(l.quantidade) || 0;
    const a = Number(l.quantidade_atendida) || 0;
    const codigo = String(l.codigo ?? '').trim();
    if (codigo && q > a + 1e-9) return codigo;
  }
  const { data: mats, error: e2 } = await supabase
    .from('materiais')
    .select('codigo')
    .eq('tenant_id', TENANT_ID)
    .eq('ativo', true)
    .limit(1);
  if (e2) throw new Error(e2.message);
  const c = String(mats?.[0]?.codigo ?? '').trim();
  if (!c) throw new Error('Nenhum codigo de material no tenant.');
  return c;
}

async function stepMaterial(scan) {
  const selectCols = 'id,codigo,codigo_barras,descricao,unidade,ativo';
  const { data: byCode, error: errCode } = await supabase
    .from('materiais')
    .select(selectCols)
    .eq('tenant_id', TENANT_ID)
    .ilike('codigo', scan)
    .limit(5);
  if (errCode) throw new Error(errCode.message);
  let rows = byCode ?? [];
  if (!rows.length) {
    const digits = scan.replace(/\D/g, '');
    if (digits.length >= 8) {
      const { data: byBar, error: errBar } = await supabase
        .from('materiais')
        .select(selectCols)
        .eq('tenant_id', TENANT_ID)
        .eq('codigo_barras', digits)
        .limit(5);
      if (errBar) throw new Error(errBar.message);
      rows = byBar ?? [];
    }
  }
  return rows[0] ?? null;
}

async function stepDocsPorCodigo(codigo) {
  const { data: linhas, error: e1 } = await supabase
    .from('iso_pro_documento_itens_planejamento')
    .select('documento_id,quantidade,quantidade_atendida')
    .eq('tenant_id', TENANT_ID)
    .ilike('codigo', codigo)
    .limit(400);
  if (e1) throw new Error(e1.message);
  const docIds = [
    ...new Set(
      (linhas ?? [])
        .filter((l) => (Number(l.quantidade) || 0) > (Number(l.quantidade_atendida) || 0) + 1e-9)
        .map((l) => String(l.documento_id)),
    ),
  ].slice(0, 60);
  if (!docIds.length) return { docs: [], docIds: [] };
  const [{ data: docs, error: e2 }, { data: itens, error: e3 }] = await Promise.all([
    supabase
      .from('iso_pro_documentos_planejamento')
      .select('id,numero,revisao,descricao,status')
      .eq('tenant_id', TENANT_ID)
      .in('id', docIds),
    supabase
      .from('iso_pro_documento_itens_planejamento')
      .select('id,documento_id,codigo,quantidade,quantidade_atendida')
      .eq('tenant_id', TENANT_ID)
      .in('documento_id', docIds),
  ]);
  if (e2) throw new Error(e2.message);
  if (e3) throw new Error(e3.message);
  return { docs: docs ?? [], itens: itens ?? [], docIds };
}

async function stepSaldoFrio() {
  const tRpc = await time('saldo_rpc_recebida', async () => {
    const { data, error } = await supabase.rpc('iso_pro_sum_quantidade_recebida_por_codigo', {
      p_tenant_id: TENANT_ID,
    });
    if (error) throw new Error(error.message);
    const por = (data ?? {}).porCodigo ?? {};
    return Object.keys(por).length;
  });
  const tAte = await time('saldo_rpc_atendida', async () => {
    const { data, error } = await supabase.rpc('iso_pro_sum_quantidade_atendida_por_codigo', {
      p_tenant_id: TENANT_ID,
    });
    if (error) throw new Error(error.message);
    const por = (data ?? {}).porCodigo ?? {};
    return Object.keys(por).length;
  });
  const tSlices = await time('saldo_slices_materiais_ajustes', async () => {
    const { data, error } = await supabase.rpc('iso_pro_read_snapshot_slices', {
      p_tenant_id: TENANT_ID,
      p_keys: ['materiais', 'estoqueAjustes'],
    });
    if (error) throw new Error(error.message);
    return data;
  });
  return {
    steps: [tRpc, tAte, tSlices],
    wallMs: tRpc.ms + tAte.ms + tSlices.ms,
    keysRecebida: tRpc.ok ? tRpc.result : 0,
  };
}

async function stepReadDocumento(docId) {
  const { data, error } = await supabase.rpc('iso_pro_read_documento_planejamento', {
    p_tenant_id: TENANT_ID,
    p_documento_id: docId,
    p_numero: null,
    p_revisao: null,
  });
  if (error) throw new Error(error.message);
  const row = data ?? {};
  if (row._error) throw new Error(String(row._error));
  return row.documento ?? null;
}

async function stepSubmitComando(codigo, docNumero) {
  const { data: snap, error: eSnap } = await supabase
    .from('iso_pro_snapshot')
    .select('updated_at')
    .eq('id', 'default')
    .eq('tenant_id', TENANT_ID)
    .maybeSingle();
  if (eSnap) throw new Error(eSnap.message);
  const baseline = String(snap?.updated_at ?? '');
  if (!baseline) throw new Error('Sem baseline updated_at');

  const stamp = Date.now();
  const key = `bip-bench-${stamp}`;
  const historico = [
    {
      id: `bip-bench-${stamp}`,
      loteNumero: `BIP-BENCH-${stamp}`,
      codigo,
      quantidade: 0.001,
      documento: docNumero || 'BIP-BENCH-DOC',
      data: new Date().toISOString(),
      _bench: true,
    },
  ];
  const { data, error } = await supabase.rpc('iso_pro_submit_atendimento_comando', {
    p_tenant_id: TENANT_ID,
    p_idempotency_key: key,
    p_baseline: baseline,
    p_historico_novas: historico,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

async function stepHeavyMateriaisCatalogo() {
  // Caminho antigo que o bipe NÃO deve usar (~40s em obra grande).
  const pageSize = 1000;
  let offset = 0;
  let total = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('materiais')
      .select('id,codigo,codigo_barras,descricao,unidade')
      .eq('tenant_id', TENANT_ID)
      .order('codigo', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const n = (data ?? []).length;
    total += n;
    if (n < pageSize) break;
    offset += pageSize;
  }
  return total;
}

async function stepHeavyRecebimentosSlice() {
  const { data, error } = await supabase.rpc('iso_pro_read_snapshot_slices', {
    p_tenant_id: TENANT_ID,
    p_keys: ['recebimentos'],
  });
  if (error) throw new Error(error.message);
  const payload = data?.payload ?? data ?? {};
  const recs = payload.recebimentos ?? payload?.slices?.recebimentos ?? [];
  return Array.isArray(recs) ? recs.length : -1;
}

console.log('=== Bench atendimento leitor (bip simulado) ===');
console.log('host:', new URL(SUPABASE_URL).host);
console.log('tenant:', TENANT_ID);
console.log('rounds:', ROUNDS, '| write:', DO_WRITE ? 'sim (staging)' : 'nao');

if (!CODIGO) {
  const pick = await time('pick_codigo', pickCodigoComPendente);
  if (!pick.ok) {
    console.error('Falha a escolher codigo:', pick.error);
    process.exit(1);
  }
  CODIGO = pick.result;
  console.log(`codigo auto (${pick.ms}ms):`, CODIGO);
} else {
  console.log('codigo:', CODIGO);
}

// --- Warm / cold saldo (1.ª abertura Atendimento) ---
console.log('\n--- Aquecimento saldo (1.ª abertura / frio) ---');
const saldoFrio = await stepSaldoFrio();
for (const s of saldoFrio.steps) {
  console.log(
    `${s.ok ? 'OK' : 'FAIL'}  ${s.label.padEnd(36)} ${String(s.ms).padStart(5)} ms` +
      (s.error ? `  ${s.error}` : s.result != null && typeof s.result === 'number' ? `  keys=${s.result}` : ''),
  );
}
console.log(`     wall_saldo_frio                         ${saldoFrio.wallMs} ms`);

// --- Heavy paths (comparação com ~40s) ---
if (!SKIP_HEAVY) {
  console.log('\n--- Caminhos pesados (NÃO usados no bip actual; comparação) ---');
  const heavyMat = await time('HEAVY_catalogo_materiais_completo', stepHeavyMateriaisCatalogo);
  console.log(
    `${heavyMat.ok ? 'OK' : 'FAIL'}  ${heavyMat.label.padEnd(36)} ${String(heavyMat.ms).padStart(5)} ms` +
      (heavyMat.ok ? `  n=${heavyMat.result}` : `  ${heavyMat.error}`),
  );
  const heavyRec = await time('HEAVY_slice_recebimentos', stepHeavyRecebimentosSlice);
  console.log(
    `${heavyRec.ok ? 'OK' : 'FAIL'}  ${heavyRec.label.padEnd(36)} ${String(heavyRec.ms).padStart(5)} ms` +
      (heavyRec.ok ? `  n=${heavyRec.result}` : `  ${heavyRec.error}`),
  );
}

// --- Bip rounds ---
console.log('\n--- Bip simulado (caminho actual) ---');
const bipSamples = [];
const docsSamples = [];
const bipWallSamples = [];
const confirmSamples = [];
let lastDocId = null;
let lastDocNumero = null;

for (let r = 1; r <= ROUNDS; r++) {
  const tMat = await time('bip_material', () => stepMaterial(CODIGO));
  const codigoMat = tMat.result?.codigo ? String(tMat.result.codigo) : CODIGO;
  const tDocs = await time('bip_docs_por_codigo', () => stepDocsPorCodigo(codigoMat));
  const wall = tMat.ms + tDocs.ms;
  bipSamples.push(tMat);
  docsSamples.push(tDocs);
  bipWallSamples.push({ ok: tMat.ok && tDocs.ok, ms: wall });

  if (tDocs.ok && tDocs.result?.docs?.[0]) {
    lastDocId = String(tDocs.result.docs[0].id);
    lastDocNumero = String(tDocs.result.docs[0].numero ?? '');
  }

  console.log(
    `R${r}: material=${tMat.ok ? tMat.ms : 'ERR'}ms docs=${tDocs.ok ? tDocs.ms : 'ERR'}ms wall_bip=${wall}ms` +
      (tDocs.ok ? ` docs_hit=${tDocs.result?.docs?.length ?? 0}` : ` ${tDocs.error}`) +
      (tMat.ok && !tMat.result ? ' (material miss)' : ''),
  );

  if (DO_WRITE && lastDocId) {
    const tRead = await time('confirm_read_doc', () => stepReadDocumento(lastDocId));
    const tWrite = await time('confirm_submit', () => stepSubmitComando(codigoMat, lastDocNumero));
    const confWall = tRead.ms + tWrite.ms;
    confirmSamples.push({
      ok: tRead.ok && tWrite.ok,
      ms: confWall,
      read: tRead,
      write: tWrite,
    });
    console.log(
      `     confirm: read=${tRead.ok ? tRead.ms : 'ERR'}ms submit=${tWrite.ok ? tWrite.ms : 'ERR'}ms wall=${confWall}ms` +
        (tWrite.ok ? '' : ` ${tWrite.error || tRead.error}`),
    );
  }
}

const sMat = summarize(bipSamples);
const sDocs = summarize(docsSamples);
const sWall = summarize(bipWallSamples);

console.log('\n=== Resumo bip (ms) ===');
console.log(
  `material:     n=${sMat.n} ok=${sMat.ok} p50=${sMat.p50} p95=${sMat.p95} max=${sMat.max}`,
);
console.log(
  `docs_codigo:  n=${sDocs.n} ok=${sDocs.ok} p50=${sDocs.p50} p95=${sDocs.p95} max=${sDocs.max}`,
);
console.log(
  `wall_bip:     n=${sWall.n} ok=${sWall.ok} p50=${sWall.p50} p95=${sWall.p95} max=${sWall.max}`,
);
console.log(`saldo_frio_wall: ${saldoFrio.wallMs} ms (1×; cache depois = 0 no bipe)`);

if (confirmSamples.length) {
  const sConf = summarize(confirmSamples);
  const reads = confirmSamples.map((c) => c.read);
  const writes = confirmSamples.map((c) => c.write);
  const sRead = summarize(reads);
  const sWrite = summarize(writes);
  console.log('\n=== Resumo confirmar sessão (ms) ===');
  console.log(
    `read_doc:     n=${sRead.n} ok=${sRead.ok} p50=${sRead.p50} p95=${sRead.p95} max=${sRead.max}`,
  );
  console.log(
    `submit:       n=${sWrite.n} ok=${sWrite.ok} p50=${sWrite.p50} p95=${sWrite.p95} max=${sWrite.max}`,
  );
  console.log(
    `wall_confirm: n=${sConf.n} ok=${sConf.ok} p50=${sConf.p50} p95=${sConf.p95} max=${sConf.max}`,
  );
}

const bipOk = sWall.p95;
console.log('\n=== Interpretação ===');
if (bipOk > 0 && bipOk < 2000) {
  console.log(
    `Caminho actual do bip está em p95=${bipOk}ms — longe dos ~40s. Se na obra ainda demora ~40s,`,
  );
  console.log(
    'provável: (1) 1.ª abertura a aquecer saldo sem cache, (2) build antigo a baixar catálogo/recebimentos,',
  );
  console.log('(3) confirmar a fazer load() completo da página, (4) rede da obra muito lenta.');
} else if (bipOk >= 2000) {
  console.log(`ALERTA: wall_bip p95=${bipOk}ms — investigar índices / rede.`);
}
if (!DO_WRITE) {
  console.log('Dica: --write no staging para incluir confirmar (read desenho + comando).');
}
