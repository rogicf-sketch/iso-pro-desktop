import 'dotenv/config';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Falta VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const s = createClient(url, key, { auth: { persistSession: false } });

async function upsertPerm({ table, match, row }) {
  let q = s.from(table).select('id');
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
  const { data: existing } = await q.maybeSingle();
  if (existing?.id) {
    const { error } = await s.from(table).update({ permitido: row.permitido }).eq('id', existing.id);
    if (error) throw error;
    return;
  }
  const { error } = await s.from(table).insert(row);
  if (error) throw error;
}

async function main() {
  const { error: probeErr } = await s.rpc('iso_pro_alterar_propria_senha', {
    p_tenant_id: '0bc5de18-4301-48b5-880a-a35a8e0f0539',
    p_login: '__probe__',
    p_senha_atual: 'x',
    p_senha_nova: 'yyyy',
  });
  console.log('rpc_probe', probeErr?.message ?? 'ok_or_user_error');

  if (probeErr?.message?.includes('Could not find the function')) {
    console.log('APPLY_SQL_NEEDED');
    console.log(fs.readFileSync('supabase/migrations/20260726140000_iso_pro_alterar_propria_senha.sql', 'utf8').slice(0, 120));
  }

  const { data: perfis, error: pe } = await s.from('perfis_acesso').select('id,tenant_id,codigo').eq('codigo', 'operacao');
  if (pe) throw pe;
  console.log('perfis_operacao', perfis?.length ?? 0);

  for (const p of perfis ?? []) {
    for (const modulo of ['configuracoes', 'usuarios']) {
      for (const acao of ['visualizar', 'editar', 'administrar']) {
        const permitido = modulo === 'configuracoes' && acao === 'visualizar';
        await upsertPerm({
          table: 'perfil_permissoes',
          match: { tenant_id: p.tenant_id, perfil_id: p.id, modulo, acao },
          row: { tenant_id: p.tenant_id, perfil_id: p.id, modulo, acao, permitido },
        });
      }
    }

    const { data: users } = await s
      .from('usuarios_sistema')
      .select('id')
      .eq('tenant_id', p.tenant_id)
      .eq('perfil_id', p.id);

    for (const u of users ?? []) {
      for (const modulo of ['configuracoes', 'usuarios']) {
        for (const acao of ['visualizar', 'editar', 'administrar']) {
          const permitido = modulo === 'configuracoes' && acao === 'visualizar';
          await upsertPerm({
            table: 'usuario_permissoes',
            match: { tenant_id: p.tenant_id, usuario_id: u.id, modulo, acao },
            row: { tenant_id: p.tenant_id, usuario_id: u.id, modulo, acao, permitido },
          });
        }
      }
    }
  }
  console.log('sync_ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
