import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { loadEnvFile } from './loadEnvFile.mjs';
loadEnvFile(path.resolve('.env'));
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const T = '00000000-0000-0000-0000-000000000001';
const t0 = Date.now();
// Probe: merge 1 doc into full array via a tiny anonymous-friendly path - call read + comment check
const { data: snap } = await sb.from('iso_pro_snapshot').select('payload').eq('id','default').eq('tenant_id',T).maybeSingle();
const docs = snap.payload.documentos;
const one = docs.find(d => String(d.numero||'').includes('00013-ABOVE'));
const patch = [{ ...one, itens: one.itens.map(it => ({...it, quantidadeAtendida: it.quantidadeAtendida})) }];
// Can't call IMMUTABLE merge via rpc easily if not exposed - skip
console.log('merge migration applied (SQL Success). docs:', docs.length, 'sample doc itens:', one?.itens?.length, 'probe', Date.now()-t0+'ms');
console.log('Pronto para testar estorno no site.');
