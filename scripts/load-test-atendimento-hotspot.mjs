#!/usr/bin/env node
/**
 * Teste hotspot — N operadores no mesmo documento/material (OCC real).
 *
 * Uso:
 *   node scripts/load-test-atendimento-hotspot.mjs --operators 10 --rounds 2
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
const OPERATORS = Number(arg('--operators', process.env.LOAD_TEST_OPERATORS ?? '10'));
const ROUNDS = Number(arg('--rounds', process.env.LOAD_TEST_ROUNDS ?? '2'));
const HOTSPOT_DOC_ID = arg('--doc-id', 'load-hotspot-doc-1');

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

async function submitHotspot(operatorId, round, baseline) {
  const key = `hotspot-op${operatorId}-r${round}-${Date.now()}`;
  const historico = [
    {
      id: `hot-${operatorId}-${round}`,
      loteNumero: `HOT-${String(operatorId).padStart(3, '0')}`,
      codigo: 'HOT-MAT',
      quantidade: 1,
      documento: HOTSPOT_DOC_ID,
      data: new Date().toISOString(),
    },
  ];
  const documentos = [
    {
      id: HOTSPOT_DOC_ID,
      numero: 'LOAD-HOTSPOT',
      itens: [{ id: 'hot-item-1', codigo: 'HOT-MAT', quantidade: 100, quantidadeAtendida: operatorId }],
    },
  ];
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

async function runRound(round) {
  let baseline = await readBaseline();
  const tasks = [];
  for (let op = 1; op <= OPERATORS; op++) {
    tasks.push(
      (async () => {
        let last = await submitHotspot(op, round, baseline);
        let retries = 0;
        while (!last.ok && last.conflict && retries < 6) {
          retries += 1;
          baseline = await readBaseline();
          last = await submitHotspot(op, round, baseline);
        }
        return { ...last, retries };
      })(),
    );
  }
  const results = await Promise.all(tasks);
  const ok = results.filter((r) => r.ok).length;
  const conflicts = results.filter((r) => !r.ok && r.conflict).length;
  const errors = results.filter((r) => !r.ok && !r.conflict).length;
  const latencies = results.filter((r) => r.ok).map((r) => r.ms);
  const p95 = latencies.length
    ? latencies.sort((a, b) => a - b)[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))]
    : 0;
  const avgRetries =
    results.reduce((a, r) => a + (r.retries ?? 0), 0) / Math.max(results.length, 1);
  return { ok, conflicts, errors, p95, total: results.length, avgRetries };
}

async function main() {
  console.log(`Hotspot test: ${OPERATORS} ops x ${ROUNDS} rondas no doc ${HOTSPOT_DOC_ID}`);
  const summary = [];
  for (let r = 1; r <= ROUNDS; r++) {
    const row = await runRound(r);
    summary.push(row);
    console.log(
      `Ronda ${r}: ok=${row.ok}/${row.total} conflitos=${row.conflicts} erros=${row.errors} p95=${row.p95}ms retries_medio=${row.avgRetries.toFixed(1)}`,
    );
  }
  const totalOk = summary.reduce((a, s) => a + s.ok, 0);
  const totalOps = summary.reduce((a, s) => a + s.total, 0);
  console.log(`Total: ${totalOk}/${totalOps} sucesso (${((100 * totalOk) / totalOps).toFixed(1)}%)`);
  process.exit(totalOk === totalOps ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
