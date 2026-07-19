import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { loadEnvFile } from './loadEnvFile.mjs';
loadEnvFile(path.resolve('.env'));
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const T = '00000000-0000-0000-0000-000000000001';
const norm = (v) => String(v ?? '').trim().toLowerCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const { data: snap } = await sb.from('iso_pro_snapshot').select('payload').eq('id','default').eq('tenant_id',T).maybeSingle();
const pl = typeof snap.payload==='string'?JSON.parse(snap.payload):snap.payload;

// soma historico por doc+codigo
const hist = new Map();
for (const h of pl.atendimentoHistorico ?? []) {
  const k = norm(h.documento) + '|' + norm(h.codigo);
  hist.set(k, (hist.get(k) ?? 0) + num(h.quantidade));
}
// qAt por doc+codigo
const docAt = new Map();
for (const d of pl.documentos ?? []) {
  for (const it of d.itens ?? []) {
    const k = norm(d.numero) + '|' + norm(it.codigo);
    if (num(it.quantidadeAtendida ?? it.quantidade_atendida) > 0 || hist.has(k)) {
      docAt.set(k, (docAt.get(k) ?? 0) + num(it.quantidadeAtendida ?? it.quantidade_atendida));
    }
  }
}
let iguais = 0; const docMenor = []; const docMaior = [];
const chaves = new Set([...hist.keys(), ...docAt.keys()]);
for (const k of chaves) {
  const h = hist.get(k) ?? 0;
  const d = docAt.get(k) ?? 0;
  if (Math.abs(h - d) < 1e-6) iguais++;
  else if (d < h) docMenor.push({ k, hist: h, doc: d });
  else docMaior.push({ k, hist: h, doc: d });
}
console.log('chaves doc+codigo com atendimento:', chaves.size);
console.log('IGUAIS (doc == historico):', iguais);
console.log('doc MENOR que historico:', docMenor.length);
for (const m of docMenor.slice(0, 15)) console.log('  ', JSON.stringify(m));
console.log('doc MAIOR que historico:', docMaior.length);
for (const m of docMaior.slice(0, 15)) console.log('  ', JSON.stringify(m));

// casos do print do utilizador
for (const k of ['e.razn010-ie6-00001 spda|carsd000-115','e.razn010-ie6-00005-under spda|ater0016','e.razn010-ie6-00026-under spda|ater0016','bgb-24"-tb-001-ss11-ni|paeka0c0b9-8033080']) {
  console.log('caso', k, '-> hist:', hist.get(k) ?? 0, '| doc:', docAt.get(k) ?? 0);
}
