/**
 * Purga dados operacionais (e opcionalmente utilizadores/perfis) na base Supabase,
 * **apenas para o tenant indicado** (`tenantId` = empresa activa no desktop).
 *
 * Autenticacao: login + senha + tenant em `usuarios_sistema`.
 * Manter em sincronia com `src/modules/configuracoes/constants/purgeCloud.constants.ts`.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { verifyPassword } from '../_shared/passwordHash.ts';

const FRASE_OPERACIONAL = 'APAGAR_DADOS_NUVEM';
const FRASE_UTILIZADORES = 'APAGAR_UTILIZADORES_E_PERFIS';

const SNAPSHOT_ID = 'default';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseTenantId(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s || !UUID_RE.test(s)) return null;
  return s;
}

const EMPTY_RELATORIO_PAYLOAD = {
  version: 1,
  reportId: '',
  salvoEm: new Date(0).toISOString(),
  numeroRelatorio: '',
  titulo: '',
  observacoes: '',
  rirCodigo: '',
  recebimentoId: '',
  recebimentoLabel: '',
  notaFiscal: '',
  fornecedor: '',
  romaneio: '',
  centroCusto: '',
  projeto: '',
  localObra: '',
  incluirLogoImpressao: true,
  fotos: [],
  relatoriosGerados: 0,
};

type PermRow = { modulo?: string | null; acao?: string | null; permitido?: boolean | null };

function hasConfiguracoesAdministrar(
  usuarioPermissoes: PermRow[] | null | undefined,
  perfilPermissoes: PermRow[] | null | undefined,
): boolean {
  const source = usuarioPermissoes && usuarioPermissoes.length > 0 ? usuarioPermissoes : perfilPermissoes ?? [];
  return source.some(
    (p) => p.permitido === true && String(p.modulo ?? '') === 'configuracoes' && String(p.acao ?? '') === 'administrar',
  );
}

async function assertTenantExists(admin: ReturnType<typeof createClient>, tenantId: string): Promise<string | null> {
  const { data, error } = await admin.from('iso_pro_tenants').select('id').eq('id', tenantId).maybeSingle();
  if (error) return error.message;
  if (!data) return 'tenantId nao corresponde a uma empresa em iso_pro_tenants.';
  return null;
}

async function deleteAllMateriaisForTenant(admin: ReturnType<typeof createClient>, tenantId: string) {
  for (;;) {
    const { data, error } = await admin.from('materiais').select('id').eq('tenant_id', tenantId).limit(400);
    if (error) throw new Error(`materiais(select): ${error.message}`);
    if (!data?.length) break;
    const ids = data.map((r) => r.id as number).filter((n) => Number.isFinite(n));
    if (!ids.length) break;
    const { error: delErr } = await admin.from('materiais').delete().in('id', ids);
    if (delErr) throw new Error(`materiais(delete): ${delErr.message}`);
  }
}

async function deleteAllDispositivosMobileForTenant(admin: ReturnType<typeof createClient>, tenantId: string) {
  for (;;) {
    const { data, error } = await admin.from('dispositivos_mobile').select('id').eq('tenant_id', tenantId).limit(400);
    if (error) throw new Error(`dispositivos_mobile(select): ${error.message}`);
    if (!data?.length) break;
    const ids = data.map((r) => (r as { id?: unknown }).id).filter((v) => v != null && String(v) !== '');
    if (!ids.length) break;
    const { error: delErr } = await admin.from('dispositivos_mobile').delete().in('id', ids as never[]);
    if (delErr) throw new Error(`dispositivos_mobile(delete): ${delErr.message}`);
  }
}

async function deleteAllDesktopLicencasForTenant(admin: ReturnType<typeof createClient>, tenantId: string) {
  const { error } = await admin.from('desktop_licencas').delete().eq('tenant_id', tenantId);
  if (error) throw new Error(`desktop_licencas(delete): ${error.message}`);
}

async function deleteAllUsuarioPermissoesForTenant(admin: ReturnType<typeof createClient>, tenantId: string) {
  const { error } = await admin.from('usuario_permissoes').delete().eq('tenant_id', tenantId);
  if (error) throw new Error(`usuario_permissoes(delete): ${error.message}`);
}

async function tryDeleteAllPerfilPermissoesForTenant(admin: ReturnType<typeof createClient>, tenantId: string) {
  const { error } = await admin.from('perfil_permissoes').delete().eq('tenant_id', tenantId);
  if (error) {
    const msg = String(error.message ?? '').toLowerCase();
    if (msg.includes('schema cache') || msg.includes('does not exist') || msg.includes('not find')) {
      return;
    }
    console.warn('[purge_cloud_data] perfil_permissoes:', error.message);
  }
}

async function deleteAllUsuariosSistemaForTenant(admin: ReturnType<typeof createClient>, tenantId: string) {
  const { error } = await admin.from('usuarios_sistema').delete().eq('tenant_id', tenantId);
  if (error) throw new Error(`usuarios_sistema(delete): ${error.message}`);
}

async function deleteAllPerfisAcessoForTenant(admin: ReturnType<typeof createClient>, tenantId: string) {
  const { error } = await admin.from('perfis_acesso').delete().eq('tenant_id', tenantId);
  if (error) throw new Error(`perfis_acesso(delete): ${error.message}`);
}

Deno.serve(async (req) => {
  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const body = (await req.json()) as Record<string, unknown>;
    const tenantId = parseTenantId(body.tenantId);
    if (!tenantId) {
      return new Response(
        JSON.stringify({ ok: false, message: 'Informe tenantId (UUID da empresa em iso_pro_tenants).' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const login = String(body.login ?? '').trim().toLowerCase();
    const senha = String(body.senha ?? '').trim();
    const confirmFraseOperacional = String(body.confirmFraseOperacional ?? '').trim();
    const incluirUtilizadoresEPerfis = Boolean(body.incluirUtilizadoresEPerfis);
    const confirmFraseUtilizadores = String(body.confirmFraseUtilizadores ?? '').trim();

    if (!login || !senha) {
      return new Response(JSON.stringify({ ok: false, message: 'Informe login e senha.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (confirmFraseOperacional !== FRASE_OPERACIONAL) {
      return new Response(
        JSON.stringify({
          ok: false,
          message: `Frase de confirmacao invalida. Escreva exactamente: ${FRASE_OPERACIONAL}`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (incluirUtilizadoresEPerfis && confirmFraseUtilizadores !== FRASE_UTILIZADORES) {
      return new Response(
        JSON.stringify({
          ok: false,
          message: `Para apagar utilizadores e perfis, confirme com a segunda frase exacta: ${FRASE_UTILIZADORES}`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

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

    const tenantErr = await assertTenantExists(admin, tenantId);
    if (tenantErr) {
      return new Response(JSON.stringify({ ok: false, message: tenantErr }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: userRow, error: userErr } = await admin
      .from('usuarios_sistema')
      .select(
        'id,login,nome,senha,ativo,perfis_acesso(id,codigo,nome,perfil_permissoes(modulo,acao,permitido)),usuario_permissoes(modulo,acao,permitido)',
      )
      .eq('login', login)
      .eq('tenant_id', tenantId)
      .eq('ativo', true)
      .maybeSingle();

    if (userErr) {
      return new Response(JSON.stringify({ ok: false, message: userErr.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const u = userRow as {
      senha?: string | null;
      usuario_permissoes?: PermRow[] | null;
      perfis_acesso?: { perfil_permissoes?: PermRow[] | null } | null;
    } | null;

    if (!u || !(await verifyPassword(senha, String(u.senha ?? '')))) {
      return new Response(JSON.stringify({ ok: false, message: 'Login ou senha invalidos para este tenant.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const okPerm = hasConfiguracoesAdministrar(u.usuario_permissoes, u.perfis_acesso?.perfil_permissoes);
    if (!okPerm) {
      return new Response(
        JSON.stringify({ ok: false, message: 'Sem permissao de administrar configuracoes na base principal.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    await deleteAllDispositivosMobileForTenant(admin, tenantId);
    await deleteAllDesktopLicencasForTenant(admin, tenantId);
    await deleteAllMateriaisForTenant(admin, tenantId);

    const now = new Date().toISOString();
    const { error: relErr } = await admin.from('iso_pro_relatorio_snapshot').upsert(
      { id: SNAPSHOT_ID, tenant_id: tenantId, payload: EMPTY_RELATORIO_PAYLOAD, updated_at: now },
      { onConflict: 'id,tenant_id' },
    );
    if (relErr) throw new Error(`iso_pro_relatorio_snapshot: ${relErr.message}`);

    const { error: snapErr } = await admin.from('iso_pro_snapshot').upsert(
      { id: SNAPSHOT_ID, tenant_id: tenantId, payload: {}, updated_at: now },
      { onConflict: 'id,tenant_id' },
    );
    if (snapErr) throw new Error(`iso_pro_snapshot: ${snapErr.message}`);

    if (incluirUtilizadoresEPerfis) {
      await deleteAllUsuarioPermissoesForTenant(admin, tenantId);
      await deleteAllUsuariosSistemaForTenant(admin, tenantId);
      await tryDeleteAllPerfilPermissoesForTenant(admin, tenantId);
      await deleteAllPerfisAcessoForTenant(admin, tenantId);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        tenantId,
        incluirUtilizadoresEPerfis,
        message: incluirUtilizadoresEPerfis
          ? `Purge na nuvem concluida para o tenant ${tenantId} (operacional + utilizadores/perfis).`
          : `Purge na nuvem concluida para o tenant ${tenantId} (operacional).`,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erro desconhecido.';
    return new Response(JSON.stringify({ ok: false, message }), {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Content-Type': 'application/json',
      },
    });
  }
});
