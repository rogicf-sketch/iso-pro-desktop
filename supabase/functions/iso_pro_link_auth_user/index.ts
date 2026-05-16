/**
 * Liga ou desliga `usuarios_sistema.auth_user_id` ↔ Supabase Auth (uuid).
 * A base sincroniza `iso_pro_auth_membership` por trigger; o JWT ganha `tenant_id` via Custom Access Token Hook.
 *
 * Segurança: corpo JSON + cabeçalho `x-iso-pro-link-secret` devem coincidir com o secret configurado
 * no Dashboard (mesmo nome que `ISO_PRO_LINK_AUTH_SECRET`). Não exponha este secret no cliente desktop.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

/** UUID canonico (inclui tenant default 00000000-0000-0000-0000-000000000001). */
const LOOSE_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Auth user ids seguem normalmente RFC; tenant_id pode ser UUID "nil" estilo ISO PRO. */
const RFC_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseTenantUuid(label: string, value: string): string | null {
  const t = value.trim();
  if (!t) return null;
  if (!LOOSE_UUID_RE.test(t)) {
    throw new Error(`${label} nao e um UUID valido.`);
  }
  return t;
}

function parseAuthUserUuid(label: string, value: string): string | null {
  const t = value.trim();
  if (!t) return null;
  if (!RFC_UUID_RE.test(t)) {
    throw new Error(`${label} nao e um UUID valido.`);
  }
  return t;
}

Deno.serve(async (req) => {
  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-iso-pro-link-secret',
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
    const expected = Deno.env.get('ISO_PRO_LINK_AUTH_SECRET') ?? '';
    const headerSecret = req.headers.get('x-iso-pro-link-secret') ?? '';
    if (!expected || headerSecret !== expected) {
      return new Response(JSON.stringify({ ok: false, message: 'Nao autorizado.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const usuarioId = String(body.usuarioId ?? '').trim();
    const tenantRaw = String(body.tenantId ?? '').trim();
    const authRaw = body.authUserId;

    if (!usuarioId) {
      return new Response(JSON.stringify({ ok: false, message: 'Informe usuarioId.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!tenantRaw) {
      return new Response(JSON.stringify({ ok: false, message: 'Informe tenantId (UUID da empresa).' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tenantId = parseTenantUuid('tenantId', tenantRaw);
    if (!tenantId) {
      return new Response(JSON.stringify({ ok: false, message: 'Informe tenantId (UUID da empresa).' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let authUserId: string | null = null;
    if (authRaw === null || authRaw === undefined || authRaw === '') {
      authUserId = null;
    } else {
      authUserId = parseAuthUserUuid('authUserId', String(authRaw));
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

    const { error } = await admin.rpc('iso_pro_set_usuario_auth_link', {
      p_usuario_id: usuarioId,
      p_tenant_id: tenantId,
      p_auth_user_id: authUserId,
    });

    if (error) {
      const msg = error.message ?? String(error);
      const notFound = msg.toLowerCase().includes('usuario nao encontrado');
      return new Response(JSON.stringify({ ok: false, message: msg }), {
        status: notFound ? 404 : 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: authUserId ? 'auth_user_id definido; membership sincronizado.' : 'auth_user_id removido; membership removido.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erro desconhecido.';
    return new Response(JSON.stringify({ ok: false, message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
