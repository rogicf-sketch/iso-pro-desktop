// Benchmark: chama a funcao de merge do servidor com o array real (4073 docs)
// e um patch de 3 desenhos — mede o tempo do caminho que o estorno MULTIPLOS usa.
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { loadEnvFile } from './loadEnvFile.mjs';
loadEnvFile(path.resolve('.env'));
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const T = '00000000-0000-0000-0000-000000000001';

const t0 = Date.now();
const { data: snap } = await sb.from('iso_pro_snapshot').select('payload').eq('id', 'default').eq('tenant_id', T).maybeSingle();
const pl = typeof snap.payload === 'string' ? JSON.parse(snap.payload) : snap.payload;
const docs = pl.documentos ?? [];
console.log('download snapshot:', Date.now() - t0 + 'ms', '| docs:', docs.length);

const alvo = [];
for (const d of docs) {
  const n = String(d.numero ?? '');
  if (n.includes('IE6-00003-UNDER') || n.includes('IE6-00022-ABOVE')) alvo.push(d);
  if (alvo.length >= 3) break;
}
console.log('patch docs:', alvo.map((d) => `${d.numero} (${(d.itens ?? []).length} itens)`));

// Patch identico (sem alteracao de quantidades) — so mede o custo do merge, nao grava nada.
const patch = alvo.map((d) => ({ ...d }));

const t1 = Date.now();
const { data, error } = await sb.rpc('iso_pro_jsonb_merge_documentos_atendimento_by_id', {
  p_current: docs,
  p_patch: patch,
  p_eh_estorno: true,
});
const dt = Date.now() - t1;
console.log('merge RPC (upload 8.5MB + exec + download):', dt + 'ms', error ? 'ERR: ' + error.message : '| out len: ' + (Array.isArray(data) ? data.length : typeof data));
