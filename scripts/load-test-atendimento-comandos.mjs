#!/usr/bin/env node
/**
 * Teste de carga Fase 2 — simula N operadores enviando comandos idempotentes em paralelo.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_TENANT_ID=... node scripts/load-test-atendimento-comandos.mjs
 *   node scripts/load-test-atendimento-comandos.mjs --operators 50 --rounds 3
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
const OPERATORS = Number(arg('--operators', process.env.LOAD_TEST_OPERATORS ?? '50'));
const ROUNDS = Number(arg('--rounds', process.env.LOAD_TEST_ROUNDS ?? '2'));

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

async function submitComando(operatorId, round, baseline) {
  const key = `loadtest-op${operatorId}-r${round}-${Date.now()}`;
  const historico = [
    {
      id: `load-${operatorId}-${round}`,
      loteNumero: `LOAD-${String(operatorId).padStart(3, '0')}`,
      codigo: 'LOAD-TEST',
      quantidade: 1,
      documento: 'LOAD-DOC',
      data: new Date().toISOString(),
    },
  ];
  const atendimentoId = `load-at-${operatorId}-${round}`;
  const atendimentos = [
    {
      id: atendimentoId,
      numero: `ATD-LOAD-${String(operatorId).padStart(3, '0')}`,
      status: 'concluido',
    },
  ];
  const isPcShape = operatorId % 2 === 0;
  const idempotencyKey = isPcShape
    ? `pc-at-${atendimentoId}-ATD-LOAD-${String(operatorId).padStart(3, '0')}`
    : key;
  const payload = isPcShape
    ? {
        p_tenant_id: TENANT_ID,
        p_idempotency_key: idempotencyKey,
        p_baseline: baseline,
        p_historico_novas: historico,
        p_atendimentos: atendimentos,
      }
    : {
        p_tenant_id: TENANT_ID,
        p_idempotency_key: idempotencyKey,
        p_baseline: baseline,
        p_historico_novas: historico,
      };
  const t0 = performance.now();
  const { data, error } = await supabase.rpc('iso_pro_submit_atendimento_comando', payload);
  const ms = Math.round(performance.now() - t0);
  if (error) {
    return { ok: false, ms, error: error.message, conflict: /CONFLICT|conflito/i.test(error.message) };
  }
  return { ok: true, ms, updatedAt: String(data) };
}

async function runRound(round) {
  let baseline = await readBaseline();
  const tasks = [];
  for (let op = 1; op <= OPERATORS; op++) {
    tasks.push(
      (async () => {
        let last = await submitComando(op, round, baseline);
        if (!last.ok && last.conflict) {
          baseline = await readBaseline();
          last = await submitComando(op, round, baseline);
        }
        return last;
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
  return { ok, conflicts, errors, p95, total: results.length };
}

async function main() {
  console.log(`Load test: ${OPERATORS} operadores x ${ROUNDS} rondas`);
  const summary = [];
  for (let r = 1; r <= ROUNDS; r++) {
    const row = await runRound(r);
    summary.push(row);
    console.log(
      `Ronda ${r}: ok=${row.ok}/${row.total} conflitos=${row.conflicts} erros=${row.errors} p95=${row.p95}ms`,
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
