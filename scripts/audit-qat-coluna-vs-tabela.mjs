/**
 * Auditoria: divergencia quantidade_atendida coluna documentos vs tabelas.
 * Uso: node --use-system-ca scripts/audit-qat-coluna-vs-tabela.mjs
 */
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { loadEnvFile } from './loadEnvFile.mjs';
loadEnvFile(path.resolve('.env'));

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const T = '00000000-0000-0000-0000-000000000001';
const norm = (v) => String(v ?? '').trim().toLowerCase();

const { data: snap, error } = await sb
  .from('iso_pro_snapshot')
  .select('documentos, updated_at')
  .eq('id', 'default')
  .eq('tenant_id', T)
  .maybeSingle();
if (error) throw error;

const docs = Array.isArray(snap?.documentos) ? snap.documentos : [];
console.log('snapshot.updated_at', snap?.updated_at);
console.log('documentos coluna', docs.length);

let compared = 0;
let diverged = 0;
const samples = [];

for (const doc of docs) {
  const docId = String(doc?.id ?? '').trim();
  if (!docId) continue;
  const itens = Array.isArray(doc?.itens) ? doc.itens : [];
  if (!itens.length) continue;

  const { data: rows, error: e2 } = await sb
    .from('iso_pro_documento_itens_planejamento')
    .select('id, codigo, quantidade_atendida')
    .eq('tenant_id', T)
    .eq('documento_id', docId);
  if (e2) {
    console.log('erro tabela', docId, e2.message);
    continue;
  }
  const byId = new Map((rows ?? []).map((r) => [String(r.id), r]));
  const byCod = new Map((rows ?? []).map((r) => [norm(r.codigo), r]));

  for (const it of itens) {
    const id = String(it?.id ?? '').trim();
    const cod = norm(it?.codigo ?? it?.codigoMaterial);
    const qCol = Number(it?.quantidadeAtendida ?? 0) || 0;
    const tab = (id && byId.get(id)) || (cod && byCod.get(cod));
    if (!tab) continue;
    const qTab = Number(tab.quantidade_atendida ?? 0) || 0;
    compared += 1;
    if (Math.abs(qCol - qTab) > 0.001) {
      diverged += 1;
      if (samples.length < 25) {
        samples.push({
          doc: doc.numero,
          item: id || cod,
          qCol,
          qTab,
          delta: qCol - qTab,
        });
      }
    }
  }
}

console.log(JSON.stringify({ compared, diverged, samples }, null, 2));
if (diverged > 0) process.exitCode = 2;
