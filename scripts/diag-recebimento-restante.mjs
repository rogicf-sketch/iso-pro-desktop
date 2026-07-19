import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { loadEnvFile } from './loadEnvFile.mjs';
loadEnvFile(path.resolve('.env'));
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const T = '00000000-0000-0000-0000-000000000001';
const { data: snap } = await sb.from('iso_pro_snapshot').select('payload, updated_at').eq('id','default').eq('tenant_id',T).maybeSingle();
const pl = typeof snap.payload==='string'?JSON.parse(snap.payload):snap.payload;
console.log('payload.dataAtualizacao:', pl.dataAtualizacao);
const r = (pl.recebimentos ?? [])[0];
if (r) {
  console.log('rec restante:', JSON.stringify({
    id: r.id, nota: r.nota ?? r.notaFiscal, fornecedor: r.fornecedorNome ?? r.fornecedor,
    modo: r.modoRecebimento, statusConf: r.statusConferencia, dataConferencia: r.dataConferencia,
    conferente: r.conferenteNome, nItens: (r.itens ?? []).length,
  }, null, 2));
}
