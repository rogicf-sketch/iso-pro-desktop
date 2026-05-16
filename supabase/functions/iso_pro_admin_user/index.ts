/**
 * Cria ou actualiza utilizador em `usuarios_sistema` + `usuario_permissoes` no tenant.
 * O actor (login+senha) deve ser admin do tenant (mesma regra que `iso_pro_usuario_administra_utilizadores`).
 *
 * Segurança: cabeçalho `x-iso-pro-admin-user-secret` = `ISO_PRO_ADMIN_USER_SECRET` (Dashboard Secrets).
 * Não expor o secret no bundle web público sem proxy; desktop pode enviar o mesmo modelo que purge_cloud_data.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

/** Aceita tenant default ISO PRO (00000000-0000-0000-0000-000000000001) e UUIDs v4 normais. */
const LOOSE_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_MODULES = new Set([
  'dashboard',
  'fornecedores',
  'colaboradores',
  'materiais',
  'documentos',
  'recebimentos',
  'conferencia',
  'etiquetas',
  'equipamentos',
  'configuracoes',
  'atendimento',
  'inventario',
  'rir',
  'rnc',
  'relatorios',
  'mobile',
  'usuarios',
]);

const ALLOWED_ACTIONS = new Set(['visualizar', 'editar', 'administrar']);

function parseTenantUuid(label: string, value: string): string {
  const t = value.trim();
  if (!t || !LOOSE_UUID_RE.test(t)) {
    throw new Error(`${label} nao e um UUID valido.`);
  }
  return t;
}

type PermRow = { modulo?: string | null; acao?: string | null; permitido?: boolean | null };

function normalizePermissions(rows: unknown): PermRow[] {
  if (!Array.isArray(rows)) return [];
  const out: PermRow[] = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const modulo = String(o.modulo ?? '').trim();
    const acao = String(o.acao ?? '').trim();
    if (!ALLOWED_MODULES.has(modulo) || !ALLOWED_ACTIONS.has(acao)) continue;
    out.push({ modulo, acao, permitido: Boolean(o.permitido) });
  }
  return out;
}

function validateUserPayload(
  mode: 'create' | 'update',
  login: string,
  nome: string,
  senha: string | undefined,
  perfilId: string,
  permissoes: PermRow[],
): string | null {
  const normalizedLogin = login.trim().toLowerCase();
  if (!normalizedLogin) return 'Informe o login.';
  if (!nome.trim()) return 'Informe o nome.';
  if (!perfilId.trim()) return 'Informe o perfil_id.';
  if (normalizedLogin.includes(' ')) return 'O login nao pode conter espacos.';
  if (mode === 'create' && !senha?.trim()) return 'Informe a senha na criacao.';
  if (senha != null && senha.trim() && senha.trim().length < 4) return 'A senha deve ter pelo menos 4 caracteres.';
  if (!permissoes.some((p) => p.acao === 'visualizar' && p.permitido)) {
    return 'Selecione pelo menos um modulo com permissao de visualizacao.';
  }
  return null;
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
    const tenantId = parseTenantUuid('tenantId', String(body.tenantId ?? ''));
    const actorLogin = String(body.actorLogin ?? '').trim();
    const actorSenha = String(body.actorSenha ?? '');

    const modeRaw = String(body.mode ?? '').trim().toLowerCase();
    const mode = modeRaw === 'update' ? 'update' : modeRaw === 'create' ? 'create' : '';
    if (mode !== 'create' && mode !== 'update') {
      return new Response(JSON.stringify({ ok: false, message: 'Informe mode: "create" ou "update".' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const usuarioId = mode === 'update' ? String(body.usuarioId ?? '').trim() : '';
    if (mode === 'update' && !usuarioId) {
      return new Response(JSON.stringify({ ok: false, message: 'Informe usuarioId no modo update.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const u = body.user;
    if (!u || typeof u !== 'object') {
      return new Response(JSON.stringify({ ok: false, message: 'Informe o objecto user.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userObj = u as Record<string, unknown>;
    const login = String(userObj.login ?? '');
    const nome = String(userObj.nome ?? '');
    const senhaRaw = userObj.senha;
    const senha =
      senhaRaw === null || senhaRaw === undefined ? undefined : String(senhaRaw);
    const perfilId = String(userObj.perfil_id ?? userObj.perfilId ?? '');
    const ativo = userObj.ativo === undefined ? true : Boolean(userObj.ativo);
    const colaboradorIdRaw = userObj.colaborador_id ?? userObj.colaboradorId;
    const colaboradorId =
      colaboradorIdRaw === null || colaboradorIdRaw === undefined || String(colaboradorIdRaw).trim() === ''
        ? null
        : String(colaboradorIdRaw).trim();

    const permissoes = normalizePermissions(body.permissoes);

    const validationError = validateUserPayload(mode, login, nome, senha, perfilId, permissoes);
    if (validationError) {
      return new Response(JSON.stringify({ ok: false, message: validationError }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const normalizedLogin = login.trim().toLowerCase();

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ ok: false, message: 'Servidor sem SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: isAdmin, error: adminErr } = await admin.rpc('iso_pro_usuario_administra_utilizadores', {
      p_tenant_id: tenantId,
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
      return new Response(JSON.stringify({ ok: false, message: 'Sem permissao para administrar utilizadores neste tenant.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (mode === 'create') {
      const { data: dup, error: dupErr } = await admin
        .from('usuarios_sistema')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('login', normalizedLogin)
        .maybeSingle();
      if (dupErr) {
        return new Response(JSON.stringify({ ok: false, message: dupErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (dup) {
        return new Response(JSON.stringify({ ok: false, message: 'Ja existe um usuario com esse login.' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const insertRow: Record<string, unknown> = {
        login: normalizedLogin,
        nome: nome.trim(),
        senha: senha!.trim(),
        perfil_id: perfilId.trim(),
        ativo,
        colaborador_id: colaboradorId,
        tenant_id: tenantId,
      };

      const { data: created, error: insErr } = await admin
        .from('usuarios_sistema')
        .insert(insertRow)
        .select('id,login,nome,ativo,perfil_id,colaborador_id')
        .single();

      if (insErr || !created) {
        return new Response(JSON.stringify({ ok: false, message: insErr?.message ?? 'Falha ao criar utilizador.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const newId = String((created as { id?: string }).id ?? '');
      if (permissoes.length) {
        const { error: pErr } = await admin.from('usuario_permissoes').insert(
          permissoes.map((p) => ({
            usuario_id: newId,
            tenant_id: tenantId,
            modulo: p.modulo,
            acao: p.acao,
            permitido: p.permitido,
          })),
        );
        if (pErr) {
          return new Response(JSON.stringify({ ok: false, message: pErr.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      return new Response(JSON.stringify({ ok: true, message: 'Utilizador criado.', user: created }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: existing, error: exErr } = await admin
      .from('usuarios_sistema')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', usuarioId)
      .maybeSingle();
    if (exErr) {
      return new Response(JSON.stringify({ ok: false, message: exErr.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!existing) {
      return new Response(JSON.stringify({ ok: false, message: 'Usuario nao encontrado neste tenant.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: dupU, error: dupUErr } = await admin
      .from('usuarios_sistema')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('login', normalizedLogin)
      .neq('id', usuarioId)
      .maybeSingle();
    if (dupUErr) {
      return new Response(JSON.stringify({ ok: false, message: dupUErr.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (dupU) {
      return new Response(JSON.stringify({ ok: false, message: 'Ja existe outro usuario com esse login.' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const updateRow: Record<string, unknown> = {
      login: normalizedLogin,
      nome: nome.trim(),
      perfil_id: perfilId.trim(),
      ativo,
      colaborador_id: colaboradorId,
    };
    if (senha != null && String(senha).trim()) {
      updateRow.senha = String(senha).trim();
    }

    const { data: updated, error: upErr } = await admin
      .from('usuarios_sistema')
      .update(updateRow)
      .eq('id', usuarioId)
      .eq('tenant_id', tenantId)
      .select('id,login,nome,ativo,perfil_id,colaborador_id')
      .single();

    if (upErr || !updated) {
      return new Response(JSON.stringify({ ok: false, message: upErr?.message ?? 'Falha ao actualizar utilizador.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: delErr } = await admin
      .from('usuario_permissoes')
      .delete()
      .eq('usuario_id', usuarioId)
      .eq('tenant_id', tenantId);
    if (delErr) {
      return new Response(JSON.stringify({ ok: false, message: delErr.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (permissoes.length) {
      const { error: insPErr } = await admin.from('usuario_permissoes').insert(
        permissoes.map((p) => ({
          usuario_id: usuarioId,
          tenant_id: tenantId,
          modulo: p.modulo,
          acao: p.acao,
          permitido: p.permitido,
        })),
      );
      if (insPErr) {
        return new Response(JSON.stringify({ ok: false, message: insPErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, message: 'Utilizador actualizado.', user: updated }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erro desconhecido.';
    return new Response(JSON.stringify({ ok: false, message }), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }
});
