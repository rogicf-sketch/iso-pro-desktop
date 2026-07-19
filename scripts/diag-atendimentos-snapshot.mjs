import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { loadEnvFile } from './loadEnvFile.mjs';
loadEnvFile(path.resolve('.env'));
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const T = '00000000-0000-0000-0000-000000000001';
const { data: snap } = await sb.from('iso_pro_snapshot').select('payload').eq('id','default').eq('tenant_id',T).maybeSingle();
const pl = typeof snap.payload==='string'?JSON.parse(snap.payload):snap.payload;
const ats = pl.atendimentos ?? [];
console.log('atendimentos no snapshot:', ats.length);
for (const a of ats) {
  console.log(JSON.stringify({ id: a.id, numero: a.numero, status: a.status, docNum: a.documentoNumero, nItens: (a.itens ?? []).length }));
}
