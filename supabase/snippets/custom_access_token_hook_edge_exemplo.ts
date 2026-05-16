/**
 * I.S.O PRO — Exemplo de Custom Access Token Hook via HTTPS (Edge Function / Deno)
 *
 * Supabase pode invocar um endpoint em vez da função Postgres. O payload e a resposta
 * seguem o mesmo contrato descrito em:
 * https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook
 *
 * Este ficheiro é referência: copiar para `supabase/functions/...` se escolheres hook HTTP.
 *
 * Alinhamento com RLS: devolver `claims` com `tenant_id` no topo (string UUID), igual ao
 * hook Postgres em `custom_access_token_hook_iso_pro.sql` e a `iso_pro_jwt_tenant_id()`.
 *
 * Variável de ambiente (Dashboard do hook): CUSTOM_ACCESS_TOKEN_SECRET (prefixo v1,whsec_).
 */

import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

type HookInput = {
  user_id: string;
  claims: Record<string, unknown>;
  authentication_method: string;
};

function bareSecret(raw: string): string {
  return raw.replace(/^v1,whsec_/, '');
}

Deno.serve(async (req) => {
  const payload = await req.text();
  const rawSecret = Deno.env.get('CUSTOM_ACCESS_TOKEN_SECRET');
  if (!rawSecret) {
    return new Response(JSON.stringify({ error: 'CUSTOM_ACCESS_TOKEN_SECRET em falta' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const headers = Object.fromEntries(req.headers);
  const wh = new Webhook(bareSecret(rawSecret));

  try {
    const body = wh.verify(payload, headers) as HookInput;
    const tenantId = await resolveTenantId(body.user_id); // implementar: DB / fetch interno

    if (!tenantId) {
      return new Response(
        JSON.stringify({
          error: {
            http_code: 403,
            message: 'Conta sem empresa ISO PRO associada.',
          },
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const claims = { ...body.claims, tenant_id: tenantId };

    return new Response(JSON.stringify({ claims }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: `Hook: ${msg}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

/** Substituir por consulta com service role a `iso_pro_auth_membership` ou RPC segura. */
async function resolveTenantId(_authUserId: string): Promise<string | null> {
  return null;
}
