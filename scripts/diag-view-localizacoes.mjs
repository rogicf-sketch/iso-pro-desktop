/** Diagnóstico (leitura): recebimentos/localizações para ATER0016 + status na tabela de escala. */
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './loadEnvFile.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
loadEnvFile(path.join(projectRoot, '.env'));

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const TENANT = '00000000-0000-0000-0000-000000000001';
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const { data: snapRows } = await supabase
    .from('iso_pro_snapshot')
    .select('payload')
    .eq('id', 'default')
    .eq('tenant_id', TENANT)
    .maybeSingle()
    .then((r) => ({ data: r.data ? [r.data] : [] }));
  const pl = typeof snapRows[0].payload === 'string' ? JSON.parse(snapRows[0].payload) : snapRows[0].payload;

  const recs = pl.recebimentos ?? [];
  console.log('recebimentos no snapshot:', recs.length);
  let itensComLoc = 0;
  let itensSemLoc = 0;
  const alvo = [];
  for (const r of recs) {
    for (const it of r.itens ?? []) {
      const loc = String(it.localizacao ?? '').trim();
      if (loc) itensComLoc += 1;
      else itensSemLoc += 1;
      const cod = String(it.codigoMaterial ?? it.codigo ?? '').trim().toUpperCase();
      if (cod === 'ATER0016') {
        alvo.push({ nota: r.nota, status: r.statusConferencia ?? r.status, modo: r.modoRecebimento, loc, keysItem: Object.keys(it).join(',') });
      }
    }
  }
  console.log('itens de recebimento com localizacao:', itensComLoc, '| sem:', itensSemLoc);
  console.log('linhas ATER0016 nos recebimentos:', JSON.stringify(alvo, null, 1));
  if (recs.length) {
    console.log('keys de um recebimento:', Object.keys(recs[0]).join(','));
    console.log('keys de um item:', Object.keys(recs[0].itens?.[0] ?? {}).join(','));
  }

  // Tabela de escala: status do doc E.RAZN010-IE6-00026
  const { data: docRow, error } = await supabase
    .from('iso_pro_documentos_planejamento')
    .select('numero, revisao, status, updated_at')
    .eq('tenant_id', TENANT)
    .ilike('numero', 'E.RAZN010-IE6-00026%')
    .limit(5);
  console.log('tabela escala:', error ? error.message : JSON.stringify(docRow, null, 1));

  // Distribuicao de status na tabela
  const { data: statusDist } = await supabase.rpc('iso_pro_operacao_contagens', { p_tenant_id: TENANT }).then((r) => ({ data: r.data })).catch(() => ({ data: null }));
  if (statusDist) console.log('contagens RPC:', JSON.stringify(statusDist).slice(0, 300));
}

main().catch((e) => {
  console.error('FALHA:', e.message);
  process.exit(1);
});
