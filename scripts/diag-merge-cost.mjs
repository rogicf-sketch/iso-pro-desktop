import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { loadEnvFile } from './loadEnvFile.mjs';
loadEnvFile(path.resolve('.env'));
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const T = '00000000-0000-0000-0000-000000000001';

// Simula o custo do merge no servidor: ler docs + aplicar regressao num item via SQL ad-hoc nao da.
// Em vez disso: medir submit comando com baseline errado (falha rapida) vs...
// Medir tempo de iso_pro_registrar com patch minimo - PERIGOSO se gravar.
// Alternativa segura: so medir tempo de SELECT payload->documentos size processing via rpc custom.

const t0 = Date.now();
const { data: snap, error } = await sb.from('iso_pro_snapshot').select('updated_at, payload').eq('id','default').eq('tenant_id',T).maybeSingle();
console.log('full select payload', Date.now()-t0, 'ms', error?.message ?? 'ok', 'bytes', JSON.stringify(snap?.payload).length);

// Tempo de merge local em JS (proxy do trabalho do servidor)
const t1 = Date.now();
const docs = snap.payload.documentos;
const byId = new Map(docs.map(d => [d.id, d]));
const target = docs.find(d => String(d.numero).includes('00013-ABOVE'));
const patched = structuredClone(target);
patched.itens = patched.itens.map(it => ({...it, quantidadeAtendida: 0}));
byId.set(patched.id, patched);
const out = [...byId.values()];
console.log('js rebuild 4073 docs', Date.now()-t1, 'ms', 'out', out.length);

const t2 = Date.now();
const idx = docs.findIndex(d => d.id === patched.id);
const out2 = docs.slice();
out2[idx] = patched;
console.log('js replace 1 index', Date.now()-t2, 'ms');
