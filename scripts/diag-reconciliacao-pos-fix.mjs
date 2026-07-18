// Simula a reconciliacao da versao 0.1.103 (estornos abatem o historico) com os dados reais da nuvem.
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { loadEnvFile } from './loadEnvFile.mjs';
loadEnvFile(path.resolve('.env'));

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const T = '00000000-0000-0000-0000-000000000001';
const norm = (v) => String(v ?? '').trim().toLowerCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const { data: snap } = await sb.from('iso_pro_snapshot').select('payload').eq('id', 'default').eq('tenant_id', T).maybeSingle();
const pl = typeof snap.payload === 'string' ? JSON.parse(snap.payload) : snap.payload;

const lotesEstornados = new Set((pl.atendimentos ?? []).filter((a) => a.status === 'estornado').map((a) => String(a.numero ?? '').trim()));
console.log('lotes estornados:', [...lotesEstornados]);

const doc = (pl.documentos ?? []).find((d) => norm(d.numero).includes('00013-above'));
const numeroDoc = norm(doc.numero);

// historico por codigo (regra nova: ignora lotes estornados; abate estornos parciais)
const hist = new Map();
for (const h of pl.atendimentoHistorico ?? []) {
  if (norm(h.documento) !== numeroDoc) continue;
  if (lotesEstornados.has(String(h.loteNumero ?? '').trim())) continue;
  hist.set(norm(h.codigo), (hist.get(norm(h.codigo)) ?? 0) + num(h.quantidade));
}
for (const e of pl.atendimentoEstornoLog ?? []) {
  if (norm(e.documentoNumero) !== numeroDoc) continue;
  if (lotesEstornados.has(String(e.loteNumero ?? '').trim())) continue;
  const k = norm(e.codigoMaterial);
  if (hist.has(k)) hist.set(k, Math.max(0, hist.get(k) - num(e.quantidadeEstornada)));
}

console.log('\n=== ' + doc.numero + ' — como a tela vai mostrar (0.1.103) ===');
for (const it of doc.itens ?? []) {
  const qSnap = num(it.quantidadeAtendida ?? it.quantidade_atendida);
  const qHist = hist.get(norm(it.codigo)) ?? 0;
  const atend = Math.min(num(it.quantidade), Math.max(qSnap, qHist));
  console.log(`${String(it.codigo).padEnd(12)} DOC ${String(it.quantidade).padStart(3)} | ATEND ${String(atend).padStart(3)} | FALTA ${String(num(it.quantidade) - atend).padStart(3)}`);
}
