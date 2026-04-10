import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;
let clientSignature = '';

const CONFIG_STORAGE_KEY = 'iso-pro-desktop-configuracoes-sistema';

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

function readSavedConfig() {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedConfigShape;
  } catch {
    return null;
  }
}

export function getRuntimeSupabaseConfig(): RuntimeSupabaseConfig {
  const saved = readSavedConfig();
  const url = String(saved?.url ?? saved?.supabaseUrl ?? import.meta.env.VITE_SUPABASE_URL ?? '').trim();
  const key = String(saved?.key ?? saved?.supabaseAnonKey ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

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

  const saved = readSavedConfig();
  const storageUrl = String(saved?.supabaseUrl ?? saved?.url ?? '').trim();
  const storageKey = String(saved?.supabaseAnonKey ?? saved?.key ?? '').trim();
  const envUrl = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim();
  const envKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

  const url = storageUrl || envUrl;
  const key = storageKey || envKey;

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
    urlFrom: storageUrl ? 'localStorage' : envUrl ? 'vite-env' : 'none',
    keyFrom: storageKey ? 'localStorage' : envKey ? 'vite-env' : 'none',
  };
}
