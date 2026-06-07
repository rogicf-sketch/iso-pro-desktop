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
        persistSession: false,
        autoRefreshToken: false,
      },
      global: globalFetch ? { fetch: globalFetch } : undefined,
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
