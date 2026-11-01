/**
 * Provisiona nova empresa (tenant) + perfil admin + primeiro utilizador.
 * Espelha `supabase/snippets/provision_novo_tenant.sql` sem SQL manual.
 *
 * Segurança: cabeçalho `x-iso-pro-admin-user-secret` = `ISO_PRO_ADMIN_USER_SECRET`
 * + actor admin no tenant indicado (`iso_pro_usuario_administra_utilizadores`).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { hashPasswordForStorage } from '../_shared/passwordHash.ts';

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const LOOSE_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseTenantUuid(label: string, value: string): string {
  const t = value.trim();
  if (!t || !LOOSE_UUID_RE.test(t)) {
    throw new Error(`${label} nao e um UUID valido.`);
  }
  return t;
}

function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

Deno.serve(async (req) => {
  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-iso-pro-admin-user-secret',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, message: 'Use POST.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const expected = Deno.env.get('ISO_PRO_ADMIN_USER_SECRET') ?? '';
    const headerSecret = req.headers.get('x-iso-pro-admin-user-secret') ?? '';
    if (!expected || headerSecret !== expected) {
      return new Response(JSON.stringify({ ok: false, message: 'Nao autorizado.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const actorTenantId = parseTenantUuid('actorTenantId', String(body.actorTenantId ?? body.tenantId ?? ''));
    const actorLogin = String(body.actorLogin ?? '').trim();
    const actorSenha = String(body.actorSenha ?? '');

    const slug = normalizeSlug(String(body.slug ?? ''));
    const nomeEmpresa = String(body.nomeEmpresa ?? body.name ?? '').trim();
    const adminLogin = String(body.adminLogin ?? '').trim().toLowerCase();
    const adminNome = String(body.adminNome ?? 'Administrador').trim() || 'Administrador';
    const adminSenha = String(body.adminSenha ?? '').trim();

    if (!slug || !SLUG_RE.test(slug)) {
      return new Response(
        JSON.stringify({
          ok: false,
          message: 'Slug invalido. Use letras minusculas, numeros e hifens (ex.: obra-norte).',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    if (!nomeEmpresa) {
      return new Response(JSON.stringify({ ok: false, message: 'Informe o nome da empresa.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!adminLogin || adminLogin.includes(' ')) {
      return new Response(JSON.stringify({ ok: false, message: 'Informe um login admin sem espacos.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (adminSenha.length < 6) {
      return new Response(JSON.stringify({ ok: false, message: 'A senha do admin deve ter pelo menos 6 caracteres.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!actorLogin || !actorSenha) {
      return new Response(JSON.stringify({ ok: false, message: 'Informe actorLogin e actorSenha.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({ ok: false, message: 'Servidor sem SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: isAdmin, error: adminErr } = await admin.rpc('iso_pro_usuario_administra_utilizadores', {
      p_tenant_id: actorTenantId,
      p_actor_login: actorLogin,
      p_actor_senha: actorSenha,
    });

    if (adminErr) {
      return new Response(JSON.stringify({ ok: false, message: adminErr.message ?? String(adminErr) }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ ok: false, message: 'Sem permissao para criar empresas (precisa ser admin).' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: slugDup } = await admin.from('iso_pro_tenants').select('id').eq('slug', slug).maybeSingle();
    if (slugDup) {
      return new Response(JSON.stringify({ ok: false, message: `Slug ja existe: ${slug}` }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Perfis padrao do sistema (mesmos da Organizacao principal).
    const PERFIS_PADRAO = ['admin', 'planejamento', 'operacao', 'consulta'] as const;
    const { data: perfisOrigem, error: perfisErr } = await admin
      .from('perfis_acesso')
      .select('*')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .in('codigo', [...PERFIS_PADRAO]);

    if (perfisErr || !perfisOrigem?.length) {
      return new Response(
        JSON.stringify({
          ok: false,
          message: perfisErr?.message ?? 'Nao foram encontrados perfis padrao no tenant default.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const perfilAdminOrigem = perfisOrigem.find((p) => String(p.codigo).toLowerCase() === 'admin');
    if (!perfilAdminOrigem) {
      return new Response(
        JSON.stringify({ ok: false, message: 'Perfil codigo=admin em falta no tenant default.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const newTenantId = crypto.randomUUID();
    const { data: tenantRow, error: tenantErr } = await admin
      .from('iso_pro_tenants')
      .insert({ id: newTenantId, slug, name: nomeEmpresa })
      .select('id,slug,name')
      .single();

    if (tenantErr || !tenantRow) {
      return new Response(JSON.stringify({ ok: false, message: tenantErr?.message ?? 'Falha ao criar tenant.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const createdPerfilIds: string[] = [];
    let perfilAdminNovoId: string | null = null;

    const rollbackTenant = async () => {
      if (createdPerfilIds.length) {
        await admin.from('perfil_permissoes').delete().in('perfil_id', createdPerfilIds);
        await admin.from('perfis_acesso').delete().in('id', createdPerfilIds);
      }
      await admin.from('iso_pro_tenants').delete().eq('id', newTenantId);
    };

    // Ordem estavel: admin primeiro, depois os restantes.
    const origemOrdenada = [...perfisOrigem].sort((a, b) => {
      const ca = String(a.codigo).toLowerCase();
      const cb = String(b.codigo).toLowerCase();
      if (ca === 'admin') return -1;
      if (cb === 'admin') return 1;
      return ca.localeCompare(cb);
    });

    for (const perfilOrigem of origemOrdenada) {
      const perfilInsert: Record<string, unknown> = { ...perfilOrigem };
      delete perfilInsert.id;
      delete perfilInsert.created_at;
      delete perfilInsert.updated_at;
      perfilInsert.tenant_id = newTenantId;

      const { data: perfilNovo, error: perfilInsErr } = await admin
        .from('perfis_acesso')
        .insert(perfilInsert)
        .select('id')
        .single();

      if (perfilInsErr || !perfilNovo) {
        await rollbackTenant();
        return new Response(
          JSON.stringify({
            ok: false,
            message: perfilInsErr?.message ?? `Falha ao copiar perfil ${String(perfilOrigem.codigo)}.`,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const perfilNovoId = String((perfilNovo as { id: string }).id);
      createdPerfilIds.push(perfilNovoId);
      if (String(perfilOrigem.codigo).toLowerCase() === 'admin') {
        perfilAdminNovoId = perfilNovoId;
      }

      const { data: permsOrigem } = await admin
        .from('perfil_permissoes')
        .select('modulo,acao,permitido')
        .eq('perfil_id', String(perfilOrigem.id));

      if (permsOrigem?.length) {
        const { error: permsErr } = await admin.from('perfil_permissoes').insert(
          permsOrigem.map((p) => ({
            perfil_id: perfilNovoId,
            modulo: p.modulo,
            acao: p.acao,
            permitido: p.permitido,
            tenant_id: newTenantId,
          })),
        );
        if (permsErr) {
          await rollbackTenant();
          return new Response(JSON.stringify({ ok: false, message: permsErr.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    if (!perfilAdminNovoId) {
      await rollbackTenant();
      return new Response(JSON.stringify({ ok: false, message: 'Perfil admin nao foi criado no novo tenant.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const senhaHash = await hashPasswordForStorage(adminSenha);
    const { data: userCreated, error: userErr } = await admin
      .from('usuarios_sistema')
      .insert({
        login: adminLogin,
        nome: adminNome,
        senha: senhaHash,
        perfil_id: perfilAdminNovoId,
        ativo: true,
        tenant_id: newTenantId,
      })
      .select('id,login,nome')
      .single();

    if (userErr || !userCreated) {
      await rollbackTenant();
      return new Response(JSON.stringify({ ok: false, message: userErr?.message ?? 'Falha ao criar admin.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const newUserId = String((userCreated as { id: string }).id);
    let authUserId: string | null = null;
    let authWarning: string | undefined;
    // Cutover JWT: admin da empresa nova precisa de Auth + membership (igual a iso_pro_admin_user).
    const authEmail = `${adminLogin}+${slug}@isopro.local`;
    try {
      const { data: authCreated, error: authErr } = await admin.auth.admin.createUser({
        email: authEmail,
        password: adminSenha,
        email_confirm: true,
        user_metadata: { iso_pro_login: adminLogin, tenant_id: newTenantId, tenant_slug: slug },
      });
      if (authErr || !authCreated.user?.id) {
        authWarning =
          authErr?.message ??
          'Empresa criada, mas falhou criar conta Auth — ligue o UUID em Usuarios (JWT).';
      } else {
        authUserId = authCreated.user.id;
        const { error: linkErr } = await admin
          .from('usuarios_sistema')
          .update({ auth_user_id: authUserId })
          .eq('id', newUserId)
          .eq('tenant_id', newTenantId);
        if (linkErr) {
          authWarning = `Conta Auth criada (${authUserId}), mas falhou gravar auth_user_id: ${linkErr.message}`;
          authUserId = null;
        }
      }
    } catch (e) {
      authWarning =
        e instanceof Error
          ? e.message
          : 'Falha ao provisionar Auth; ligue o UUID manualmente em Usuarios.';
    }

    // Snapshot vazio para a nova empresa (idempotente se ja existir).
    await admin.from('iso_pro_snapshot').upsert(
      {
        id: 'default',
        tenant_id: newTenantId,
        payload: {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id,tenant_id' },
    );

    return new Response(
      JSON.stringify({
        ok: true,
        message: authUserId
          ? 'Empresa criada com admin ligado ao Supabase Auth (JWT) e perfis padrao.'
          : 'Empresa criada com perfis padrao.',
        tenant: tenantRow,
        perfis: createdPerfilIds.length,
        admin: {
          ...userCreated,
          ...(authUserId ? { auth_user_id: authUserId } : {}),
        },
        adminLogin,
        ...(authWarning ? { warning: authWarning } : {}),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
