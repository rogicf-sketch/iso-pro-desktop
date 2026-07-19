import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { loadEnvFile } from './loadEnvFile.mjs';
loadEnvFile(path.resolve('.env'));
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const T = '00000000-0000-0000-0000-000000000001';
const { data: snap } = await sb.from('iso_pro_snapshot').select('payload').eq('id','default').eq('tenant_id',T).maybeSingle();
const pl = typeof snap.payload==='string'?JSON.parse(snap.payload):snap.payload;
const est = pl.atendimentoEstornos;
console.log('tipo:', Array.isArray(est) ? 'array' : typeof est, '| tamanho:', Array.isArray(est)?est.length:'-');
if (Array.isArray(est)) {
  for (const e of est.slice(0, 10)) console.log(JSON.stringify(e, null, 1).slice(0, 800));
}
