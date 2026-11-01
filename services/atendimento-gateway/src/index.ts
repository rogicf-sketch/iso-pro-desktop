/**
 * Gateway BR de Confirmar atendimento.
 * Browser (canteiro) → VM OCI → Supabase REST com service role (datacenter).
 * Auth: Origin allowlist (web) / X-Iso-Pro-Client (mobile) + **JWT de utilizador** (sem bypass anon).
 */
import http from 'node:http';

const PORT = Number(process.env.PORT ?? '8791');
const SUPABASE_URL = String(process.env.SUPABASE_URL ?? '').trim().replace(/\/$/, '');
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
const ANON_KEY = String(process.env.SUPABASE_ANON_KEY ?? '').trim();
const RPC_TIMEOUT_MS = Math.max(3_000, Number(process.env.RPC_TIMEOUT_MS ?? '12000'));
const AUTH_TIMEOUT_MS = Math.max(2_000, Number(process.env.AUTH_TIMEOUT_MS ?? '4000'));
/** Pedidos /minuto por IP (ou tenant). Default obra: 120. */
const RATE_LIMIT_PER_MIN = Math.max(10, Number(process.env.RATE_LIMIT_PER_MIN ?? '120'));
const ALLOWED_ORIGINS = String(
  process.env.ALLOWED_ORIGINS ??
    'https://isoprogestaodemateriais.com.br,https://www.isoprogestaodemateriais.com.br',
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[atendimento-gateway] Falta SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();

function clientIp(req: http.IncomingMessage): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0]!.trim();
  return req.socket.remoteAddress ?? 'unknown';
}

/** Sliding window simples: N pedidos por minuto por chave. */
function checkRateLimit(key: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const windowMs = 60_000;
  let bucket = rateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    rateBuckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > RATE_LIMIT_PER_MIN) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  return { ok: true };
}

type ComandoBody = {
  p_tenant_id?: string;
  p_idempotency_key?: string;
  p_baseline?: string;
  p_documentos?: unknown;
  p_historico_novas?: unknown;
  p_lotes_novos?: unknown;
  p_sequencia_atendimento?: number;
  p_atendimentos?: unknown;
  p_estorno_log_novas?: unknown;
};

function json(res: http.ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function corsHeaders(origin: string | undefined): Record<string, string> {
  const allow =
    origin && ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0] ?? 'https://isoprogestaodemateriais.com.br';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Iso-Pro-Client',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

function applyCors(res: http.ServerResponse, origin: string | undefined): void {
  const h = corsHeaders(origin);
  for (const [k, v] of Object.entries(h)) res.setHeader(k, v);
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function tenantFromJwt(token: string): string | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const jsonStr = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const payload = JSON.parse(jsonStr) as {
      tenant_id?: string;
      app_metadata?: { tenant_id?: string };
      role?: string;
      exp?: number;
    };
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) {
      return null;
    }
    const t = payload.tenant_id ?? payload.app_metadata?.tenant_id;
    return typeof t === 'string' && isUuid(t) ? t : null;
  } catch {
    return null;
  }
}

/** So origens oficiais no browser; app mobile usa X-Iso-Pro-Client + JWT. */
function originAllowed(origin: string | undefined): boolean {
  return Boolean(origin && ALLOWED_ORIGINS.includes(origin));
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  return JSON.parse(raw) as unknown;
}

async function rpcCall(fn: string, body: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text) as unknown;
      } catch {
        data = text;
      }
    }
    if (!res.ok) {
      const msg =
        data && typeof data === 'object' && data !== null && 'message' in data
          ? String((data as { message: unknown }).message)
          : `RPC ${fn} HTTP ${res.status}`;
      const err = new Error(msg) as Error & { code?: string };
      if (/conflict|ISO_PRO_SNAPSHOT_CONFLICT/i.test(msg)) err.code = 'CONFLICT';
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/** Valida access token de utilizador junto do Auth Supabase (assinatura/expiracao). */
async function verifyUserAccessToken(token: string): Promise<boolean> {
  if (!ANON_KEY) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function authorize(
  authHeader: string | undefined,
  tenantId: string,
  origin: string | undefined,
): Promise<{ ok: true; mode: 'jwt' } | { ok: false; status: number; error: string }> {
  if (!authHeader?.toLowerCase().startsWith('bearer ')) {
    return { ok: false, status: 401, error: 'Authorization Bearer obrigatorio.' };
  }
  const token = authHeader.slice(7).trim();
  if (!token) return { ok: false, status: 401, error: 'Token vazio.' };

  const originOk = originAllowed(origin);

  // Anon / publishable: nunca autoriza writes (onda 2 — fecha bypass Origin+anon → service_role).
  if (ANON_KEY && token === ANON_KEY) {
    return {
      ok: false,
      status: 401,
      error: 'Gateway exige sessao JWT. Anon key nao autoriza Confirmar.',
    };
  }

  // JWT de utilizador: tem de validar no Auth; tenant_id (se existir) tem de coincidir.
  const jwtTenant = tenantFromJwt(token);
  if (jwtTenant && jwtTenant !== tenantId) {
    return { ok: false, status: 403, error: 'JWT tenant_id nao coincide com p_tenant_id.' };
  }

  const validUser = await verifyUserAccessToken(token);
  if (!validUser) {
    return { ok: false, status: 401, error: 'JWT invalido ou expirado.' };
  }

  // Sem claim tenant: so aceitar se Origin for oficial (legado / cutover).
  if (!jwtTenant && !originOk) {
    return { ok: false, status: 403, error: 'JWT sem tenant_id exige Origin oficial.' };
  }

  return { ok: true, mode: 'jwt' };
}

async function submitComando(body: ComandoBody): Promise<{ updatedAt: string }> {
  const data = await rpcCall(
    'iso_pro_submit_atendimento_comando',
    {
      p_tenant_id: body.p_tenant_id,
      p_idempotency_key: body.p_idempotency_key,
      p_baseline: body.p_baseline,
      p_documentos: body.p_documentos ?? null,
      p_historico_novas: body.p_historico_novas ?? null,
      p_lotes_novos: body.p_lotes_novos ?? null,
      p_sequencia_atendimento: body.p_sequencia_atendimento ?? null,
      p_atendimentos: body.p_atendimentos ?? null,
      p_estorno_log_novas: body.p_estorno_log_novas ?? null,
    },
    RPC_TIMEOUT_MS,
  );
  if (data == null || data === '') throw new Error('RPC sem updatedAt');
  return { updatedAt: String(data) };
}

async function peekComando(tenantId: string, key: string): Promise<string | null> {
  try {
    const data = await rpcCall(
      'iso_pro_peek_atendimento_comando',
      { p_tenant_id: tenantId, p_idempotency_key: key },
      Math.min(RPC_TIMEOUT_MS, 8_000),
    );
    if (data == null || data === '') return null;
    return String(data);
  } catch {
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
  applyCors(res, origin);

  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/atendimento/health') {
    json(res, 200, { ok: true, service: 'atendimento-gateway' });
    return;
  }

  if (req.method !== 'POST' || url.pathname !== '/api/atendimento/comando') {
    json(res, 404, { ok: false, error: 'Not found' });
    return;
  }

  // Porta de entrada: Origin oficial (browser) OU app mobile com JWT (X-Iso-Pro-Client).
  const clientHeader = String(req.headers['x-iso-pro-client'] ?? '')
    .trim()
    .toLowerCase();
  const isMobileClient = clientHeader === 'iso-pro-mobile';
  if (!originAllowed(origin) && !isMobileClient) {
    json(res, 403, { ok: false, error: 'Origin nao permitida.' });
    return;
  }

  const t0 = Date.now();
  try {
    const raw = await readJson(req);
    const body = (raw && typeof raw === 'object' ? raw : {}) as ComandoBody;
    const tenantId = String(body.p_tenant_id ?? '').trim();
    const idem = String(body.p_idempotency_key ?? '').trim();
    const baseline = String(body.p_baseline ?? '').trim();

    if (!isUuid(tenantId) || !idem || !baseline) {
      json(res, 400, { ok: false, error: 'p_tenant_id, p_idempotency_key e p_baseline obrigatorios.' });
      return;
    }

    const rateKey = `${clientIp(req)}:${tenantId}`;
    const rate = checkRateLimit(rateKey);
    if (!rate.ok) {
      res.setHeader('Retry-After', String(rate.retryAfterSec));
      json(res, 429, {
        ok: false,
        error: 'Rate limit excedido. Aguarde e tente novamente.',
        retryAfterSec: rate.retryAfterSec,
      });
      return;
    }

    const auth = await authorize(req.headers.authorization, tenantId, origin);
    if (!auth.ok) {
      json(res, auth.status, { ok: false, error: auth.error });
      return;
    }
    // Writes: so JWT (web e mobile). Anon+Origin ja e rejeitado em authorize().

    const already = await peekComando(tenantId, idem);
    if (already) {
      console.info(
        `[atendimento-gateway] hit_cache ${Date.now() - t0}ms auth=${auth.mode} key=${idem.slice(0, 24)}`,
      );
      json(res, 200, { ok: true, updatedAt: already, via: 'peek' });
      return;
    }

    try {
      const { updatedAt } = await submitComando(body);
      console.info(`[atendimento-gateway] ok ${Date.now() - t0}ms auth=${auth.mode} key=${idem.slice(0, 24)}`);
      json(res, 200, { ok: true, updatedAt, via: 'rpc' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao gravar';
      const confirmed = await peekComando(tenantId, idem);
      if (confirmed) {
        console.info(
          `[atendimento-gateway] reconcile ${Date.now() - t0}ms auth=${auth.mode} key=${idem.slice(0, 24)}`,
        );
        json(res, 200, { ok: true, updatedAt: confirmed, via: 'reconcile' });
        return;
      }
      const status =
        (err as { code?: string })?.code === 'CONFLICT' || /conflict/i.test(msg) ? 409 : 504;
      console.warn(`[atendimento-gateway] fail ${Date.now() - t0}ms ${msg}`);
      json(res, status, { ok: false, error: msg, conflict: status === 409 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno';
    console.error('[atendimento-gateway]', msg);
    json(res, 500, { ok: false, error: msg });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[atendimento-gateway] listening 127.0.0.1:${PORT}`);
});
