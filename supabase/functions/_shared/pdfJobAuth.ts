import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { verifyPassword } from './passwordHash.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PDF_JOB_TIPOS = [
  'rir',
  'rnc',
  'relatorio_fotografico',
  'planejamento_campo',
  'etiqueta',
  'recibo_atendimento',
  'recibo_estorno',
  'recibo_sessao',
  'relatorio_final_obra',
] as const;

export type PdfJobTipo = (typeof PDF_JOB_TIPOS)[number];

export function parseTenantId(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s || !UUID_RE.test(s)) return null;
  return s;
}

export function parseJobId(raw: unknown): string | null {
  return parseTenantId(raw);
}

export function isPdfJobTipo(raw: unknown): raw is PdfJobTipo {
  return typeof raw === 'string' && (PDF_JOB_TIPOS as readonly string[]).includes(raw);
}

function resolveAllowedOrigin(reqOrigin: string | null): string {
  const raw = Deno.env.get('ISO_PRO_PDF_CORS_ORIGINS') ?? Deno.env.get('ISO_PRO_CORS_ORIGINS') ?? '';
  const allowed = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!allowed.length) return '*';
  if (reqOrigin && allowed.includes(reqOrigin)) return reqOrigin;
  return allowed[0] ?? '*';
}

export function corsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get('Origin') ?? null;
  return {
    'Access-Control-Allow-Origin': resolveAllowedOrigin(origin),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

export function createServiceClient(): SupabaseClient | null {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type PdfAuthUser = {
  id: string;
  login: string;
  nome: string;
};

async function assertPdfJobUserByToken(
  admin: SupabaseClient,
  tenantId: string,
  tokenRaw: unknown,
): Promise<{ ok: true; user: PdfAuthUser } | { ok: false; message: string; status: number }> {
  const token = String(tokenRaw ?? '').trim();
  if (!token || !UUID_RE.test(token)) {
    return { ok: false, message: 'Token operacional invalido.', status: 401 };
  }

  const { data, error } = await admin.rpc('iso_pro_validar_token_operacional', {
    p_tenant_id: tenantId,
    p_token: token,
  });

  if (error) return { ok: false, message: error.message, status: 400 };
  const body = data as { ok?: boolean; error?: string; user?: PdfAuthUser } | null;
  if (!body?.ok || !body.user) {
    return { ok: false, message: String(body?.error ?? 'Token operacional invalido ou expirado.'), status: 401 };
  }

  return {
    ok: true,
    user: {
      id: String(body.user.id),
      login: String(body.user.login),
      nome: String(body.user.nome ?? body.user.login),
    },
  };
}

export async function assertPdfJobUser(
  admin: SupabaseClient,
  tenantId: string,
  loginRaw: unknown,
  senhaRaw: unknown,
  operationalTokenRaw?: unknown,
): Promise<{ ok: true; user: PdfAuthUser } | { ok: false; message: string; status: number }> {
  if (operationalTokenRaw != null && String(operationalTokenRaw).trim()) {
    return assertPdfJobUserByToken(admin, tenantId, operationalTokenRaw);
  }

  const login = String(loginRaw ?? '').trim().toLowerCase();
  const senha = String(senhaRaw ?? '').trim();
  if (!login || !senha) {
    return { ok: false, message: 'Informe login e senha ou token operacional.', status: 400 };
  }

  const { data: tenantRow, error: tenantErr } = await admin
    .from('iso_pro_tenants')
    .select('id')
    .eq('id', tenantId)
    .maybeSingle();
  if (tenantErr) return { ok: false, message: tenantErr.message, status: 400 };
  if (!tenantRow) return { ok: false, message: 'tenantId inválido.', status: 400 };

  const { data: userRow, error: userErr } = await admin
    .from('usuarios_sistema')
    .select('id,login,nome,senha,ativo')
    .eq('login', login)
    .eq('tenant_id', tenantId)
    .eq('ativo', true)
    .maybeSingle();

  if (userErr) return { ok: false, message: userErr.message, status: 400 };
  if (!userRow) return { ok: false, message: 'Utilizador ou senha inválidos.', status: 401 };

  const hash = String((userRow as { senha?: string }).senha ?? '');
  const valid = await verifyPassword(senha, hash);
  if (!valid) return { ok: false, message: 'Utilizador ou senha inválidos.', status: 401 };

  return {
    ok: true,
    user: {
      id: String((userRow as { id: string }).id),
      login: String((userRow as { login: string }).login),
      nome: String((userRow as { nome?: string }).nome ?? login),
    },
  };
}
