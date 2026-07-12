#!/usr/bin/env node
/**
 * Simulação de canteiro — hotspot, avalanche (abertura/fecho) e flush burst.
 *
 * Uso:
 *   node scripts/load-test-atendimento-canteiro.mjs --mode hotspot --operators 10
 *   node scripts/load-test-atendimento-canteiro.mjs --mode avalanche --operators 50
 *   node scripts/load-test-atendimento-canteiro.mjs --mode flush-burst --operators 20
 */
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '';
const TENANT_ID = process.env.SUPABASE_TENANT_ID ?? process.env.VITE_ISO_PRO_TENANT_ID ?? '';
const MODE = arg('--mode', 'hotspot');
const OPERATORS = Number(arg('--operators', process.env.LOAD_TEST_OPERATORS ?? '10'));
const ROUNDS = Number(arg('--rounds', process.env.LOAD_TEST_ROUNDS ?? '2'));
const HOTSPOT_DOC_ID = arg('--doc-id', 'load-canteiro-doc-1');
const CONFLICT_RETRY_MAX = 6;

if (!SUPABASE_URL || !SUPABASE_KEY || !TENANT_ID) {
  console.error('Defina SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_TENANT_ID.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function readBaseline() {
  const { data, error } = await supabase
    .from('iso_pro_snapshot')
    .select('updated_at')
    .eq('id', 'default')
    .eq('tenant_id', TENANT_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.updated_at) throw new Error('Snapshot sem baseline updated_at.');
  return String(data.updated_at);
}

function buildPayload(operatorId, round, suffix = '') {
  const key = `canteiro-${MODE}-op${operatorId}-r${round}${suffix}-${Date.now()}`;
  const historico = [
    {
      id: `cant-${operatorId}-${round}${suffix}`,
      loteNumero: `CNT-${String(operatorId).padStart(3, '0')}`,
      codigo: 'CANT-MAT',
      quantidade: 1,
      documento: HOTSPOT_DOC_ID,
      data: new Date().toISOString(),
    },
  ];
  const documentos = [
    {
      id: HOTSPOT_DOC_ID,
      numero: 'LOAD-CANTEIRO',
      itens: [{ id: 'cant-item-1', codigo: 'CANT-MAT', quantidade: 1000, quantidadeAtendida: operatorId }],
    },
  ];
  return { key, historico, documentos };
}

async function submitComando(operatorId, round, baseline, suffix = '') {
  const { key, historico, documentos } = buildPayload(operatorId, round, suffix);
  const t0 = performance.now();
  const { data, error } = await supabase.rpc('iso_pro_submit_atendimento_comando', {
    p_tenant_id: TENANT_ID,
    p_idempotency_key: key,
    p_baseline: baseline,
    p_historico_novas: historico,
    p_documentos: documentos,
  });
  const ms = Math.round(performance.now() - t0);
  if (error) {
    return {
      ok: false,
      ms,
      error: error.message,
      conflict: /CONFLICT|conflito|ISO_PRO_SNAPSHOT_CONFLICT/i.test(error.message),
    };
  }
  return { ok: true, ms, updatedAt: String(data) };
}

async function submitWithOccRetry(operatorId, round, initialBaseline, suffix = '') {
  let baseline = initialBaseline;
  let last = await submitComando(operatorId, round, baseline, suffix);
  let retries = 0;
  while (!last.ok && last.conflict && retries < CONFLICT_RETRY_MAX) {
    retries += 1;
    baseline = await readBaseline();
    last = await submitComando(operatorId, round, baseline, suffix);
  }
  return { ...last, retries };
}

function summarize(label, results) {
  const ok = results.filter((r) => r.ok).length;
  const conflicts = results.filter((r) => !r.ok && r.conflict).length;
  const errors = results.filter((r) => !r.ok && !r.conflict).length;
  const latencies = results.filter((r) => r.ok).map((r) => r.ms);
  const p95 = latencies.length
    ? latencies.sort((a, b) => a - b)[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))]
    : 0;
  const avgRetries = results.reduce((a, r) => a + (r.retries ?? 0), 0) / Math.max(results.length, 1);
  console.log(
    `${label}: ok=${ok}/${results.length} conflitos=${conflicts} erros=${errors} p95=${p95}ms retries_medio=${avgRetries.toFixed(1)}`,
  );
  return { ok, total: results.length, conflicts, errors, p95, avgRetries };
}

async function runHotspot() {
  console.log(`Modo HOTSPOT: ${OPERATORS} ops x ${ROUNDS} rondas no doc ${HOTSPOT_DOC_ID}`);
  const summary = [];
  for (let r = 1; r <= ROUNDS; r++) {
    const baseline = await readBaseline();
    const results = await Promise.all(
      Array.from({ length: OPERATORS }, (_, i) => submitWithOccRetry(i + 1, r, baseline)),
    );
    summary.push(summarize(`Ronda ${r}`, results));
  }
  return summary;
}

async function runAvalanche() {
  console.log(`Modo AVALANCHE: ${OPERATORS} ops — rajada abertura + rajada fecho (mesmo doc)`);
  const summary = [];
  for (const [label, suffix] of [
    ['Abertura turno (t=0)', '-open'],
    ['Fecho turno (t=55)', '-close'],
  ]) {
    const baseline = await readBaseline();
    const results = await Promise.all(
      Array.from({ length: OPERATORS }, (_, i) => submitWithOccRetry(i + 1, 1, baseline, suffix)),
    );
    summary.push(summarize(label, results));
  }
  return summary;
}

async function runFlushBurst() {
  console.log(`Modo FLUSH-BURST: ${OPERATORS} comandos com baseline partilhado (simula fila offline)`);
  const baseline = await readBaseline();
  const results = await Promise.all(
    Array.from({ length: OPERATORS }, (_, i) => submitWithOccRetry(i + 1, 1, baseline, '-flush')),
  );
  return [summarize('Flush simultaneo', results)];
}

async function main() {
  let summary;
  if (MODE === 'avalanche') {
    summary = await runAvalanche();
  } else if (MODE === 'flush-burst') {
    summary = await runFlushBurst();
  } else {
    summary = await runHotspot();
  }

  const totalOk = summary.reduce((a, s) => a + s.ok, 0);
  const totalOps = summary.reduce((a, s) => a + s.total, 0);
  const pct = totalOps ? ((100 * totalOk) / totalOps).toFixed(1) : '0.0';
  console.log(`\nTotal ${MODE}: ${totalOk}/${totalOps} sucesso (${pct}%)`);
  process.exit(totalOk === totalOps ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
