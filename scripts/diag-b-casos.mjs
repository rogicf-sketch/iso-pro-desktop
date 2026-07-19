import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { loadEnvFile } from './loadEnvFile.mjs';
loadEnvFile(path.resolve('.env'));
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const T = '00000000-0000-0000-0000-000000000001';
const norm = (v) => String(v ?? '').trim().toLowerCase();
const { data: snap } = await sb.from('iso_pro_snapshot').select('payload').eq('id','default').eq('tenant_id',T).maybeSingle();
const pl = typeof snap.payload==='string'?JSON.parse(snap.payload):snap.payload;
const casos = [
 {doc:'E.RAZN010-IE6-00002-ABOVE', cod:'EPRD10PVN4C_1_35'},
 {doc:'E.RAZN010-IE6-00022-ABOVE SPDA', cod:'CCBR0BP31'},
];
for (const c of casos) {
  // docs cujo numero comeca com o prefixo
  const docsMatch = (pl.documentos??[]).filter(d => norm(d.numero).includes(norm(c.doc).slice(0,20)));
  console.log('CASO', c.doc, c.cod, '-> docs semelhantes:', docsMatch.map(d=>`${d.numero} rev${d.revisao} status=${d.status}`));
  for (const d of docsMatch) {
    const tem = (d.itens??[]).find(it=>norm(it.codigo)===norm(c.cod));
    if (tem) console.log('   TEM o codigo em', d.numero, 'q', tem.quantidade, 'qAt', tem.quantidadeAtendida);
  }
  // historico deste caso
  const h = (pl.atendimentoHistorico??[]).filter(x=>norm(x.codigo)===norm(c.cod) && norm(x.documento).includes(norm(c.doc).slice(0,15)));
  console.log('   historico:', h.map(x=>`${x.loteNumero}:${x.quantidade}@doc="${x.documento}" docId=${x.documentoId}`));
}
