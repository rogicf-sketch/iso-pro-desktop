import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readIsoProCloudConnectionComMigracao } from './isoProCloudConnection';
import { canUseDesktopSupabaseFetch, createDesktopSupabaseFetch } from './supabaseDesktopFetch';

let client: SupabaseClient | null = null;
let clientSignature = '';

type RuntimeSupabaseConfig = {
  url: string;
  key: string;
  materiaisNuvem: boolean;
};

export type SupabaseOperationalStatus = 'ready' | 'partial' | 'missing';

function isTruthyViteString(value: unknown): boolean {
  if (value === true) return true;
  if (value === false || value == null) return false;
  const s = String(value).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

type CredentialSource = 'localStorage' | 'vite-env' | 'none';

/**
 * Resolve URL + anon key como par atomico (nunca mistura fontes).
 *
 * Prioridade:
 * 1. `VITE_SUPABASE_PREFER_SAVED_CONFIG=true` + credenciais guardadas na instalacao
 * 2. Par completo em `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (build)
 * 3. Par completo em localStorage ao nivel da instalacao
 * 4. Nao configurado (partial/missing) — nunca combina URL de uma fonte com chave de outra
 */
export function resolveSupabaseCredentials(): {
  url: string;
  key: string;
  urlFrom: CredentialSource;
  keyFrom: CredentialSource;
} {
  const preferSaved = isTruthyViteString(import.meta.env.VITE_SUPABASE_PREFER_SAVED_CONFIG);
  const saved = readIsoProCloudConnectionComMigracao();
  const envUrl = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim();
  const envKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  const storageUrl = saved?.supabaseUrl ?? '';
  const storageKey = saved?.supabaseAnonKey ?? '';

  if (preferSaved && storageUrl && storageKey) {
    return {
      url: storageUrl,
      key: storageKey,
      urlFrom: 'localStorage',
      keyFrom: 'localStorage',
    };
  }

  if (envUrl && envKey) {
    return {
      url: envUrl,
      key: envKey,
      urlFrom: 'vite-env',
      keyFrom: 'vite-env',
    };
  }

  if (storageUrl && storageKey) {
    return {
      url: storageUrl,
      key: storageKey,
      urlFrom: 'localStorage',
      keyFrom: 'localStorage',
    };
  }

  return {
    url: '',
    key: '',
    urlFrom: 'none',
    keyFrom: 'none',
  };
}

export function getRuntimeSupabaseConfig(): RuntimeSupabaseConfig {
  const { url, key } = resolveSupabaseCredentials();
  const saved = readIsoProCloudConnectionComMigracao();

  return {
    url,
    key,
    materiaisNuvem: Boolean(saved?.materiaisNuvem),
  };
}

export function getSupabase(): SupabaseClient | null {
  const { url, key } = getRuntimeSupabaseConfig();

  if (!url || !key) return null;

  const nextSignature = `${url}::${key}`;
  if (!client || clientSignature !== nextSignature) {
    const globalFetch = canUseDesktopSupabaseFetch() ? createDesktopSupabaseFetch() : undefined;
    client = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      global: globalFetch ? { fetch: globalFetch } : undefined,
    });
    clientSignature = nextSignature;
  }

  return client;
}

/**
 * RPC sem passar pela fila de sessao do cliente.
 * A abertura de documento ficava 12s nessa fila e a tela desistia.
 */
function abortErrorFrom(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new DOMException('The operation was aborted.', 'AbortError');
}

/** Extrai access_token de formatos supabase-js (plano ou `currentSession`). */
function accessTokenFromAuthStorageRaw(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as {
      access_token?: string;
      expires_at?: number;
      currentSession?: { access_token?: string; expires_at?: number };
    };
    const token = String(parsed.access_token ?? parsed.currentSession?.access_token ?? '').trim();
    if (!token) return null;
    const exp = Number(parsed.expires_at ?? parsed.currentSession?.expires_at);
    if (Number.isFinite(exp) && exp > 0 && exp * 1000 < Date.now() + 15_000) return null;
    return token;
  } catch {
    return null;
  }
}

/** JWT do login, lido do armazenamento local, sem entrar na fila do cliente. */
function readStoredUserAccessToken(url: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  let ref = '';
  try {
    ref = new URL(url).hostname.split('.')[0] ?? '';
  } catch {
    return null;
  }
  if (!ref) return null;
  const keys = [`sb-${ref}-auth-token`, `sb-${ref}-auth-token-code-verifier`];
  for (const key of keys) {
    if (key.endsWith('code-verifier')) continue;
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    const token = accessTokenFromAuthStorageRaw(raw);
    if (token) return token;
  }
  // Varredura leve: builds antigos / storageKey custom.
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('sb-') || !k.includes('auth-token') || k.includes('code-verifier')) continue;
      const token = accessTokenFromAuthStorageRaw(localStorage.getItem(k) ?? '');
      if (token) return token;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Token em memoria do cliente Auth (Electron: storage pode atrasar vs sessao viva). */
async function readSessionAccessTokenQuick(timeoutMs = 8_000): Promise<string | null> {
  try {
    const supabase = getSupabase();
    if (!supabase) return null;
    const raced = await Promise.race([
      supabase.auth.getSession().then((r) => {
        const t = r.data.session?.access_token?.trim() ?? '';
        return t || null;
      }),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
    return raced;
  } catch {
    return null;
  }
}

/** Um unico refresh/getSession em voo — evita 4× fila Auth no Visualizar (EXE). */
let accessTokenInflight: Promise<string | null> | null = null;

async function resolveUserAccessToken(forceRefresh = false): Promise<string | null> {
  const { url } = getRuntimeSupabaseConfig();
  if (!forceRefresh) {
    const stored = readStoredUserAccessToken(url);
    if (stored) return stored;
  }
  if (accessTokenInflight) return accessTokenInflight;
  accessTokenInflight = (async () => {
    try {
      const supabase = getSupabase();
      if (!supabase) return null;
      if (forceRefresh) {
        try {
          const refreshed = await Promise.race([
            supabase.auth.refreshSession(),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
          ]);
          if (refreshed && 'data' in refreshed) {
            const t = refreshed.data.session?.access_token?.trim() ?? '';
            if (t) return t;
          }
        } catch {
          /* getSession abaixo */
        }
      }
      return await readSessionAccessTokenQuick(8_000);
    } finally {
      accessTokenInflight = null;
    }
  })();
  return accessTokenInflight;
}

function supabaseRestFetch(): typeof fetch {
  return canUseDesktopSupabaseFetch() ? createDesktopSupabaseFetch() : fetch;
}

async function postRpcWithBearer<T>(
  fn: string,
  args: Record<string, unknown>,
  token: string,
  timeoutMs: number,
): Promise<{ data: T | null; error: string | null; status: number }> {
  const { url, key } = getRuntimeSupabaseConfig();
  if (!url || !key) return { data: null, error: 'Supabase nao configurado.', status: 0 };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await supabaseRestFetch()(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(args),
    });
    const text = await res.text();
    if (!res.ok) return { data: null, error: text.slice(0, 180) || `HTTP ${res.status}`, status: res.status };
    return { data: (text ? JSON.parse(text) : null) as T, error: null, status: res.status };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return {
      data: null,
      error: aborted ? 'Tempo esgotado ao consultar a nuvem.' : 'Falha ao consultar a nuvem.',
      status: 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * RPC com o JWT do utilizador, fora da fila de sessao.
 * Se nao houver token valido, devolve skipped para o chamador usar o cliente normal.
 * Em 401: um refresh + retry (EXE e web iguais).
 */
export async function rpcComJwtSemFila<T>(
  fn: string,
  args: Record<string, unknown>,
  timeoutMs = 90_000,
): Promise<{ data: T | null; error: string | null; skipped: boolean }> {
  const { url, key } = getRuntimeSupabaseConfig();
  if (!url || !key) return { data: null, error: 'Supabase nao configurado.', skipped: false };
  let token = await resolveUserAccessToken(false);
  if (!token) return { data: null, error: null, skipped: true };

  let result = await postRpcWithBearer<T>(fn, args, token, timeoutMs);
  if (result.status === 401) {
    token = await resolveUserAccessToken(true);
    if (token) result = await postRpcWithBearer<T>(fn, args, token, timeoutMs);
  }
  return { data: result.data, error: result.error, skipped: false };
}

/**
 * RPC fora da fila de sessao.
 * Prefer JWT do login (RLS fail-closed / tabelas sem GRANT anon); senao anon key
 * (so RPCs DEFINER de bootstrap / peek que ainda aceitam anon).
 */
export async function rpcSemFilaAuth<T>(
  fn: string,
  args: Record<string, unknown>,
  timeoutMs = 8_000,
  signal?: AbortSignal,
): Promise<{ data: T | null; error: string | null }> {
  const { url, key } = getRuntimeSupabaseConfig();
  if (!url || !key) return { data: null, error: 'Supabase nao configurado.' };
  if (signal?.aborted) throw abortErrorFrom(signal);
  const bearer = (await resolveUserAccessToken(false)) || key;
  const fetchImpl = supabaseRestFetch();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetchImpl(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        apikey: key,
        Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(args),
    });
    const text = await res.text();
    if (!res.ok) return { data: null, error: text.slice(0, 180) || `HTTP ${res.status}` };
    return { data: (text ? JSON.parse(text) : null) as T, error: null };
  } catch (error) {
    if (signal?.aborted) throw abortErrorFrom(signal);
    const aborted = error instanceof Error && error.name === 'AbortError';
    return { data: null, error: aborted ? 'Tempo esgotado ao consultar a nuvem.' : 'Falha ao consultar a nuvem.' };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** SELECT curto na REST, fora da fila de sessao. Prefer JWT quando existir. */
export async function restGetSemFilaAuth<T>(
  pathAndQuery: string,
  timeoutMs = 8_000,
  signal?: AbortSignal,
): Promise<{ data: T | null; error: string | null }> {
  const { url, key } = getRuntimeSupabaseConfig();
  if (!url || !key) return { data: null, error: 'Supabase nao configurado.' };
  if (signal?.aborted) {
    const err = new Error('AbortError');
    err.name = 'AbortError';
    throw err;
  }
  const bearer = (await resolveUserAccessToken(false)) || key;
  const fetchImpl = supabaseRestFetch();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  const path = pathAndQuery.replace(/^\//, '');
  try {
    const res = await fetchImpl(`${url}/rest/v1/${path}`, {
      method: 'GET',
      signal: ctrl.signal,
      headers: {
        apikey: key,
        Authorization: `Bearer ${bearer}`,
        Accept: 'application/json',
      },
    });
    const text = await res.text();
    if (!res.ok) return { data: null, error: text.slice(0, 180) || `HTTP ${res.status}` };
    return { data: (text ? JSON.parse(text) : null) as T, error: null };
  } catch (error) {
    if (signal?.aborted) {
      const err = new Error('AbortError');
      err.name = 'AbortError';
      throw err;
    }
    const aborted = error instanceof Error && error.name === 'AbortError';
    return { data: null, error: aborted ? 'Tempo esgotado ao consultar a nuvem.' : 'Falha ao consultar a nuvem.' };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Descarta instancia do cliente (ex.: troca de URL/chave ou logout). */
export function resetSupabaseClient() {
  client = null;
  clientSignature = '';
}

export function hasSupabaseConfig() {
  return getSupabaseOperationalStatus() === 'ready';
}

export function shouldUseCloudMaterials() {
  const { materiaisNuvem } = getRuntimeSupabaseConfig();
  return hasSupabaseConfig() && materiaisNuvem;
}

export function getSupabaseOperationalStatus(): SupabaseOperationalStatus {
  const { url, key, urlFrom, keyFrom } = resolveSupabaseCredentials();
  if (url && key && urlFrom === keyFrom) return 'ready';
  if (url || key) return 'partial';
  return 'missing';
}

/** Para o painel de dispositivos mobile: de onde veio URL/chave e se estao visiveis ao cliente. */
export type SupabaseConfigDiagnostics = {
  hasUrl: boolean;
  hasKey: boolean;
  urlHost: string | null;
  keyLength: number;
  urlFrom: CredentialSource;
  keyFrom: CredentialSource;
  status: SupabaseOperationalStatus;
};

export function getSupabaseConfigDiagnostics(): SupabaseConfigDiagnostics {
  if (typeof window === 'undefined') {
    return {
      hasUrl: false,
      hasKey: false,
      urlHost: null,
      keyLength: 0,
      urlFrom: 'none',
      keyFrom: 'none',
      status: 'missing',
    };
  }

  const { url, key, urlFrom, keyFrom } = resolveSupabaseCredentials();
  const status = getSupabaseOperationalStatus();

  let urlHost: string | null = null;
  try {
    if (url) urlHost = new URL(url).hostname;
  } catch {
    urlHost = null;
  }

  return {
    hasUrl: Boolean(url),
    hasKey: Boolean(key),
    urlHost,
    keyLength: key.length,
    urlFrom,
    keyFrom,
    status,
  };
}

/** Mensagem operacional quando a ligacao Supabase esta incompleta ou indisponivel. */
export function formatSupabaseConnectionError(baseMessage: string): string {
  const d = getSupabaseConfigDiagnostics();
  if (d.status === 'partial') {
    return `${baseMessage} Configuracao incompleta: URL (${d.urlFrom}) e chave (${d.keyFrom}) devem vir da mesma fonte (build ou Configuracoes).`;
  }
  if (d.urlHost) {
    return `${baseMessage} Servidor: ${d.urlHost}.`;
  }
  return baseMessage;
}
