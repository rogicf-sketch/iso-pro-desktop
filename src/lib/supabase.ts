import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getScopedIsoProStorageKey } from './isoProAmbiente';
import { parseSupabaseSavedConfigRoot } from './schemas/supabaseSavedConfig.zod';

let client: SupabaseClient | null = null;
let clientSignature = '';

function configuracaoSistemaStorageKey(): string {
  return getScopedIsoProStorageKey('iso-pro-desktop-configuracoes-sistema');
}

type RuntimeSupabaseConfig = {
  url: string;
  key: string;
  materiaisNuvem: boolean;
};

type SavedConfigShape = Partial<RuntimeSupabaseConfig> & {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

export type SupabaseOperationalStatus = 'ready' | 'partial' | 'missing';

function isTruthyViteString(value: unknown): boolean {
  if (value === true) return true;
  if (value === false || value == null) return false;
  const s = String(value).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

function readSavedConfig() {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(configuracaoSistemaStorageKey());
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const obj = parseSupabaseSavedConfigRoot(parsed);
    if (obj === null) return null;
    return obj as SavedConfigShape;
  } catch {
    return null;
  }
}

/**
 * Resolve URL + anon key.
 *
 * - Por omissão: se o build tiver `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`, usam-se em
 *   prioridade ao localStorage (evita config antiga a anular o projecto do instalador).
 * - Com `VITE_SUPABASE_PREFER_SAVED_CONFIG=true` e URL+chave guardadas nas Configurações,
 *   volta a prevalecer o localStorage (testes / outro projecto sem rebuild).
 */
function resolveSupabaseCredentials(): {
  url: string;
  key: string;
  urlFrom: 'localStorage' | 'vite-env' | 'none';
  keyFrom: 'localStorage' | 'vite-env' | 'none';
} {
  const preferSaved = isTruthyViteString(import.meta.env.VITE_SUPABASE_PREFER_SAVED_CONFIG);
  const saved = readSavedConfig();
  const envUrl = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim();
  const envKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  const storageUrl = String(saved?.url ?? saved?.supabaseUrl ?? '').trim();
  const storageKey = String(saved?.key ?? saved?.supabaseAnonKey ?? '').trim();

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

  const url = storageUrl || envUrl;
  const key = storageKey || envKey;
  return {
    url,
    key,
    urlFrom: storageUrl ? 'localStorage' : envUrl ? 'vite-env' : 'none',
    keyFrom: storageKey ? 'localStorage' : envKey ? 'vite-env' : 'none',
  };
}

export function getRuntimeSupabaseConfig(): RuntimeSupabaseConfig {
  const saved = readSavedConfig();
  const { url, key } = resolveSupabaseCredentials();

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
    client = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    clientSignature = nextSignature;
  }

  return client;
}

/** Descarta instancia do cliente (ex.: troca de URL/chave ou logout). */
export function resetSupabaseClient() {
  client = null;
  clientSignature = '';
}

export function hasSupabaseConfig() {
  const { url, key } = getRuntimeSupabaseConfig();
  return Boolean(url && key);
}

export function shouldUseCloudMaterials() {
  const { materiaisNuvem } = getRuntimeSupabaseConfig();
  return hasSupabaseConfig() && materiaisNuvem;
}

export function getSupabaseOperationalStatus(): SupabaseOperationalStatus {
  const { url, key } = getRuntimeSupabaseConfig();
  if (url && key) return 'ready';
  if (url || key) return 'partial';
  return 'missing';
}

/** Para o painel de dispositivos mobile: de onde veio URL/chave e se estao visiveis ao cliente. */
export type SupabaseConfigDiagnostics = {
  hasUrl: boolean;
  hasKey: boolean;
  urlHost: string | null;
  keyLength: number;
  urlFrom: 'localStorage' | 'vite-env' | 'none';
  keyFrom: 'localStorage' | 'vite-env' | 'none';
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
    };
  }

  const { url, key, urlFrom, keyFrom } = resolveSupabaseCredentials();

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
  };
}
