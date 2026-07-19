import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { loadEnvFile } from './loadEnvFile.mjs';
loadEnvFile(path.resolve('.env'));
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const TENANT = '00000000-0000-0000-0000-000000000001';
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const { data: snap } = await sb.from('iso_pro_snapshot').select('payload').eq('id','default').eq('tenant_id',TENANT).maybeSingle();
const pl = typeof snap.payload === 'string' ? JSON.parse(snap.payload) : snap.payload;
// soma historico por doc+codigo
const hist = new Map();
for (const h of pl.atendimentoHistorico ?? []) {
  const k = `${String(h.documento ?? '').trim()}|${String(h.codigo ?? '').trim().toLowerCase()}`;
  hist.set(k, (hist.get(k) ?? 0) + num(h.quantidade));
}
let docsDiv = new Set(); let linhasDiv = 0; let qtdSemHist = 0; let linhasComAt = 0;
for (const d of pl.documentos ?? []) {
  for (const it of d.itens ?? []) {
    const a = num(it.quantidadeAtendida ?? it.quantidade_atendida);
    if (a <= 0) continue;
    linhasComAt++;
    const k = `${String(d.numero ?? '').trim()}|${String(it.codigo ?? '').trim().toLowerCase()}`;
    const hSum = hist.get(k) ?? 0;
    if (hSum + 1e-9 < a) { docsDiv.add(d.numero); linhasDiv++; qtdSemHist += (a - hSum); }
  }
}
console.log('linhas com atendimento no planejamento:', linhasComAt);
console.log('linhas com atendimento SEM historico completo:', linhasDiv);
console.log('desenhos afetados:', docsDiv.size);
console.log('quantidade total sem historico:', qtdSemHist);
console.log('exemplos:', [...docsDiv].slice(0, 12));
