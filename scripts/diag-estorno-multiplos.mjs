// Verifica se o estorno MULTIPLOS de hoje chegou a nuvem (comandos + lote + log).
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { loadEnvFile } from './loadEnvFile.mjs';
loadEnvFile(path.resolve('.env'));

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const T = '00000000-0000-0000-0000-000000000001';

const { data: cmds } = await sb
  .from('iso_pro_atendimento_comandos')
  .select('idempotency_key, created_at, snapshot_updated_at, payload')
  .eq('tenant_id', T)
  .gte('created_at', '2026-07-18T23:00:00Z')
  .order('created_at', { ascending: false })
  .limit(10);

console.log('=== COMANDOS desde 23:00Z (20:00 local) ===', (cmds ?? []).length);
for (const c of cmds ?? []) {
  const p = c.payload ?? {};
  console.log(
    c.created_at,
    '| aplicado:', c.snapshot_updated_at ? 'SIM' : 'NAO',
    '| key:', String(c.idempotency_key).slice(0, 50),
    '| docs:', (p.documentos ?? []).length,
    '| estLog:', (p.atendimentoEstornoLog ?? []).length,
  );
}

const { data: snap } = await sb.from('iso_pro_snapshot').select('payload, updated_at').eq('id', 'default').eq('tenant_id', T).maybeSingle();
const pl = typeof snap.payload === 'string' ? JSON.parse(snap.payload) : snap.payload;
console.log('\nsnapshot updated_at:', snap.updated_at);

console.log('\n=== LOG DE ESTORNOS (ultimos 12) ===', (pl.atendimentoEstornoLog ?? []).length, 'total');
for (const e of (pl.atendimentoEstornoLog ?? []).slice(-12)) {
  console.log(e.dataEstorno, '|', e.loteNumero, '|', e.codigoMaterial, 'q:', e.quantidadeEstornada, '|', e.documentoNumero);
}

console.log('\n=== LOTES MULTIPLOS (12/07) ===');
for (const a of pl.atendimentos ?? []) {
  const n = String(a.numero ?? '');
  if (n.includes('20260712-00080') || n.includes('20260712-00081')) {
    console.log(n, '| status:', a.status, '| itens:', (a.itens ?? []).length);
  }
}
