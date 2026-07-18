/** Diagnóstico (leitura): o que o RPC de slices devolve para recebimentos/documentos + sync RPC status. */
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
  // 1. O mesmo RPC que a app usa para ler slices
  const { data, error } = await supabase.rpc('iso_pro_read_snapshot_slices', {
    p_tenant_id: TENANT,
    p_keys: ['recebimentos'],
  });
  if (error) {
    console.log('slices ERRO:', error.message);
  } else {
    const payload = data?.payload ?? data ?? {};
    const recs = payload.recebimentos ?? data?.recebimentos ?? [];
    console.log('slices keys:', Object.keys(data ?? {}).join(','));
    console.log('recebimentos via RPC:', Array.isArray(recs) ? recs.length : typeof recs);
    if (Array.isArray(recs) && recs.length) {
      const r0 = recs.find((r) => (r.itens ?? []).some((i) => String(i.codigo ?? '').toUpperCase() === 'ATER0016')) ?? recs[0];
      const it = (r0.itens ?? [])[0] ?? {};
      console.log('exemplo item keys:', Object.keys(it).join(','));
      let comLoc = 0;
      let total = 0;
      for (const r of recs) for (const i of r.itens ?? []) { total++; if (String(i.localizacao ?? '').trim()) comLoc++; }
      console.log('itens com localizacao via RPC:', comLoc, '/', total);
    }
  }

  // 2. Definicao do sync RPC: como deriva status (ler pg_proc via SQL nao e possivel por anon; testar upsert com status)
  const { data: d2, error: e2 } = await supabase.rpc('iso_pro_list_documentos_planejamento_page', {
    p_tenant_id: TENANT,
    p_busca: 'E.RAZN010-IE6-00026-UNDER',
    p_offset: 0,
    p_limit: 5,
  });
  if (e2) console.log('list page ERRO:', e2.message);
  else {
    const docs = d2?.documentos ?? [];
    console.log('list page:', JSON.stringify(docs.map((d) => ({ numero: d.numero, status: d.status, totalItens: d.totalItens, quantidadeAtendida: d.quantidadeAtendida })), null, 1));
    console.log('_source:', d2?._source);
  }
}

main().catch((e) => {
  console.error('FALHA:', e.message);
  process.exit(1);
});
