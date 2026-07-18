// Mede os lotes MULTIPLOS: quantos desenhos distintos e itens cada um tem.
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { loadEnvFile } from './loadEnvFile.mjs';
loadEnvFile(path.resolve('.env'));

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const T = '00000000-0000-0000-0000-000000000001';

const { data: snap } = await sb.from('iso_pro_snapshot').select('payload').eq('id', 'default').eq('tenant_id', T).maybeSingle();
const pl = typeof snap.payload === 'string' ? JSON.parse(snap.payload) : snap.payload;

const porLote = new Map();
for (const h of pl.atendimentoHistorico ?? []) {
  const n = String(h.loteNumero ?? '').trim();
  if (!n) continue;
  const e = porLote.get(n) ?? { itens: 0, docs: new Set(), q: 0 };
  e.itens += 1;
  e.q += Number(h.quantidade ?? 0) || 0;
  const d = String(h.documento ?? '').trim();
  if (d && d !== '-') e.docs.add(d);
  porLote.set(n, e);
}

const rows = [...porLote.entries()]
  .map(([n, e]) => ({ lote: n, itens: e.itens, desenhos: e.docs.size, unidades: e.q }))
  .sort((a, b) => b.desenhos - a.desenhos);

console.log('=== TOP 15 lotes por numero de desenhos distintos ===');
for (const r of rows.slice(0, 15)) {
  console.log(`${r.lote}  desenhos: ${String(r.desenhos).padStart(3)}  itens: ${String(r.itens).padStart(4)}  unidades: ${r.unidades}`);
}

console.log('\ntamanho documentos[]:', (pl.documentos ?? []).length);
const doc03 = (pl.documentos ?? []).filter((d) => String(d.numero ?? '').includes('IE6-00003-UNDER'));
console.log('docs IE6-00003-UNDER:', doc03.map((d) => `${d.numero} itens=${(d.itens ?? []).length}`));
