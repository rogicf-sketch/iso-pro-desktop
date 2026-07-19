import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { loadEnvFile } from './loadEnvFile.mjs';
loadEnvFile(path.resolve('.env'));
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const { data: snaps, error } = await sb
  .from('iso_pro_snapshot')
  .select('tenant_id, id, updated_at, payload')
  .eq('id', 'default');
if (error) { console.log('err:', error.message); process.exit(1); }
for (const s of snaps ?? []) {
  const pl = typeof s.payload === 'string' ? JSON.parse(s.payload) : (s.payload ?? {});
  const recs = pl.recebimentos ?? [];
  console.log('tenant:', s.tenant_id, '| updated:', s.updated_at, '| recebimentos:', recs.length,
    '| docs:', (pl.documentos ?? []).length, '| materiais:', (pl.materiais ?? []).length);
  for (const r of recs.slice(0, 5)) {
    console.log('   -', r.nota ?? r.notaFiscal, '|', r.fornecedorNome ?? r.fornecedor, '|', r.modoRecebimento);
  }
}
const { data: recRows, error: e2 } = await sb
  .from('iso_pro_recebimentos')
  .select('tenant_id, id, nota_fiscal, fornecedor')
  .limit(50);
console.log('--- tabela iso_pro_recebimentos ---');
if (e2) console.log('err:', e2.message);
const porTenant = {};
for (const r of recRows ?? []) {
  porTenant[r.tenant_id] = (porTenant[r.tenant_id] ?? 0) + 1;
}
console.log(porTenant);
