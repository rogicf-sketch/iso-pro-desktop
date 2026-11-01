/**
 * Copia perfis padrao (admin, planejamento, operacao, consulta) da Organizacao
 * principal para tenants que ainda nao os tem (ex.: Construcap).
 *
 * Uso: node --use-system-ca scripts/sync-perfis-padrao-tenants.mjs
 */
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { loadEnvFile } from './loadEnvFile.mjs';

loadEnvFile(path.resolve('.env'));

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const PERFIS_PADRAO = ['admin', 'planejamento', 'operacao', 'consulta'];

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Falta VITE_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: origem, error: oe } = await sb
  .from('perfis_acesso')
  .select('*')
  .eq('tenant_id', DEFAULT_TENANT_ID)
  .in('codigo', PERFIS_PADRAO);

if (oe || !origem?.length) {
  console.error('Perfis origem', oe?.message || 'vazio');
  process.exit(1);
}

const { data: tenants, error: te } = await sb.from('iso_pro_tenants').select('id,slug,name');
if (te) {
  console.error(te.message);
  process.exit(1);
}

for (const t of tenants ?? []) {
  if (t.id === DEFAULT_TENANT_ID) continue;

  const { data: existentes } = await sb.from('perfis_acesso').select('id,codigo').eq('tenant_id', t.id);
  const codigos = new Set((existentes ?? []).map((p) => String(p.codigo).toLowerCase()));
  const faltam = origem.filter((p) => !codigos.has(String(p.codigo).toLowerCase()));

  if (!faltam.length) {
    console.log(`OK ${t.slug}: ja tem ${PERFIS_PADRAO.join(', ')}`);
    continue;
  }

  console.log(`Sync ${t.slug} (${t.name}): a criar ${faltam.map((p) => p.codigo).join(', ')}`);

  for (const perfilOrigem of faltam) {
    const insert = { ...perfilOrigem };
    delete insert.id;
    delete insert.created_at;
    delete insert.updated_at;
    insert.tenant_id = t.id;

    const { data: novo, error: ie } = await sb.from('perfis_acesso').insert(insert).select('id').single();
    if (ie || !novo) {
      console.error(`  falha perfil ${perfilOrigem.codigo}:`, ie?.message);
      continue;
    }

    const { data: perms } = await sb
      .from('perfil_permissoes')
      .select('modulo,acao,permitido')
      .eq('perfil_id', perfilOrigem.id);

    if (perms?.length) {
      const { error: pe } = await sb.from('perfil_permissoes').insert(
        perms.map((p) => ({
          perfil_id: novo.id,
          modulo: p.modulo,
          acao: p.acao,
          permitido: p.permitido,
          tenant_id: t.id,
        })),
      );
      if (pe) console.error(`  falha perms ${perfilOrigem.codigo}:`, pe.message);
      else console.log(`  + ${perfilOrigem.codigo} (${perms.length} perms)`);
    } else {
      console.log(`  + ${perfilOrigem.codigo} (sem perms)`);
    }
  }
}

console.log('Concluido.');
