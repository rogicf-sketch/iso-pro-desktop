/**
 * Espelha tabela `materiais` → fatia `iso_pro_snapshot.payload.materiais` (todos os tenants).
 * Uso: node --use-system-ca scripts/sync-materiais-tabela-para-snapshot.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Falta VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const s = createClient(url, key, { auth: { persistSession: false } });

async function listMateriaisTenant(tenantId) {
  const all = [];
  const page = 500;
  for (let from = 0; ; from += page) {
    const { data, error } = await s
      .from('materiais')
      .select('id,codigo,codigo_barras,descricao,diametro,disciplina,unidade,peso,estoque_minimo,ativo')
      .eq('tenant_id', tenantId)
      .order('codigo', { ascending: true })
      .range(from, from + page - 1);
    if (error) throw error;
    const rows = data ?? [];
    all.push(
      ...rows.map((r) => ({
        id: String(r.id),
        codigo: r.codigo,
        codigoBarras: r.codigo_barras ?? '',
        descricao: r.descricao ?? '',
        diametro: r.diametro ?? '',
        disciplina: r.disciplina ?? '',
        unidade: r.unidade ?? 'UN',
        peso: Number(r.peso) || 0,
        estoqueMinimo: Number(r.estoque_minimo) || 0,
        saldoAtual: 0,
        ativo: r.ativo !== false,
        observacao: '',
      })),
    );
    if (rows.length < page) break;
  }
  return all;
}

async function main() {
  const { data: tenants, error } = await s.from('iso_pro_tenants').select('id,slug,name');
  if (error) throw error;
  for (const t of tenants ?? []) {
    const mats = await listMateriaisTenant(t.id);
    console.log(t.slug, 'materiais', mats.length);
    if (mats.length === 0) continue;
    const { error: patchErr } = await s.rpc('iso_pro_patch_snapshot', {
      p_tenant_id: t.id,
      p_baseline: null,
      p_patch: { materiais: mats },
    });
    if (patchErr) {
      console.error(t.slug, 'patch_fail', patchErr.message);
      continue;
    }
    console.log(t.slug, 'snapshot_ok');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
