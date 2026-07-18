/**
 * Passo 2 do restauro do incidente 12/07: alinhar as tabelas de escala
 * (iso_pro_documentos_planejamento) com o snapshot restaurado, em lotes de 40
 * (o sync completo via RPC excede o statement timeout com 4073 docs / ~26k itens).
 *
 * - Upsert de TODOS os documentos do snapshot em chunks via iso_pro_upsert_documentos_planejamento_lote
 * - Remove os docs demo DOC-1001/DOC-1002 da tabela
 *
 * Uso: node --use-system-ca scripts/restore-planejamento-incidente-20260712-tabelas.mjs
 */
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './loadEnvFile.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
loadEnvFile(path.join(projectRoot, '.env'));

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;
const TENANT = '00000000-0000-0000-0000-000000000001';
const CHUNK = 40;

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const { data: snapRow, error: snapErr } = await supabase
    .from('iso_pro_snapshot')
    .select('payload')
    .eq('id', 'default')
    .eq('tenant_id', TENANT)
    .maybeSingle();
  if (snapErr || !snapRow) throw new Error('Falha a ler snapshot: ' + (snapErr?.message ?? 'sem linha'));
  const pl = typeof snapRow.payload === 'string' ? JSON.parse(snapRow.payload) : snapRow.payload;
  const docs = pl.documentos ?? [];
  console.log('Snapshot: documentos a sincronizar:', docs.length);

  let done = 0;
  let totalDocs = 0;
  let totalItens = 0;
  for (let i = 0; i < docs.length; i += CHUNK) {
    const chunk = docs.slice(i, i + CHUNK);
    let tentativa = 0;
    for (;;) {
      tentativa += 1;
      const { data, error } = await supabase.rpc('iso_pro_upsert_documentos_planejamento_lote', {
        p_tenant_id: TENANT,
        p_documentos: chunk,
      });
      if (!error) {
        const row = (data ?? {});
        if (row.ok === false) throw new Error('Upsert falhou: ' + (row.error ?? '?'));
        totalDocs += Number(row.documentos) || 0;
        totalItens += Number(row.itens) || 0;
        break;
      }
      if (tentativa >= 3) throw new Error(`Chunk ${i / CHUNK}: ${error.message}`);
      await new Promise((r) => setTimeout(r, 1500 * tentativa));
    }
    done += chunk.length;
    if (done % 400 === 0 || done === docs.length) console.log(`  upsert: ${done}/${docs.length}`);
  }
  console.log('Upsert concluido — docs:', totalDocs, '| itens:', totalItens);

  // Remover docs demo da tabela (nao estao no snapshot restaurado)
  const { error: delErr, count } = await supabase
    .from('iso_pro_documentos_planejamento')
    .delete({ count: 'exact' })
    .eq('tenant_id', TENANT)
    .in('numero', ['DOC-1001', 'DOC-1002']);
  console.log('Remocao docs demo:', delErr ? 'FALHOU: ' + delErr.message : `OK (${count ?? '?'} linha(s))`);

  // Confirmacao final
  const { count: total } = await supabase
    .from('iso_pro_documentos_planejamento')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT);
  console.log('CONFIRMACAO tabela iso_pro_documentos_planejamento:', total, 'documentos (esperado:', docs.length, ')');
}

main().catch((e) => {
  console.error('FALHA:', e.message);
  process.exit(1);
});
