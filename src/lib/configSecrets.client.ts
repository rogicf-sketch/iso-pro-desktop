import type { ConfiguracaoSistema } from '@/modules/configuracoes/types/configuracao.types';

/** Campos sensíveis — Electron: cofre OS (safeStorage); web: memória + sessionStorage (nunca localStorage). */
export const CONFIG_SECRET_FIELD_KEYS = [
  'isoProLinkAuthSecret',
  'isoProAdminUserSecret',
  'relatorioFinalIaApiKey',
  'smtpSenha',
  'supabaseAnonKey',
  'desktopLicencaToken',
  'rirPrefSenha',
  'rncPrefSenha',
] as const satisfies readonly (keyof ConfiguracaoSistema)[];

export type ConfigSecretFieldKey = (typeof CONFIG_SECRET_FIELD_KEYS)[number];

const SESSION_SECRETS_KEY = 'iso-pro-config-secrets-session-v1';

let secretsCache: Partial<Record<ConfigSecretFieldKey, string>> = {};
let vaultHydrated = false;
let vaultAvailable = false;

export function isConfigSecretsVaultAvailable(): boolean {
  return vaultAvailable;
}

export function getCachedConfigSecret(key: ConfigSecretFieldKey): string {
  return secretsCache[key] ?? '';
}

/** Só testes — limpa cache/sessão. */
export function resetConfigSecretsClientForTests(): void {
  secretsCache = {};
  vaultHydrated = false;
  vaultAvailable = false;
  try {
    sessionStorage.removeItem(SESSION_SECRETS_KEY);
  } catch {
    /* ignore */
  }
}

function pickSecretsFromConfig(config: ConfiguracaoSistema): Record<ConfigSecretFieldKey, string> {
  const out = {} as Record<ConfigSecretFieldKey, string>;
  for (const key of CONFIG_SECRET_FIELD_KEYS) {
    out[key] = String(config[key] ?? '').trim();
  }
  return out;
}

function stripSecretsFromConfig(config: ConfiguracaoSistema): ConfiguracaoSistema {
  const next = { ...config };
  for (const key of CONFIG_SECRET_FIELD_KEYS) {
    (next as unknown as Record<string, string>)[key] = '';
  }
  return next;
}

function readSessionSecrets(): Partial<Record<ConfigSecretFieldKey, string>> {
  if (typeof sessionStorage === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(SESSION_SECRETS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Partial<Record<ConfigSecretFieldKey, string>> = {};
    const o = parsed as Record<string, unknown>;
    for (const key of CONFIG_SECRET_FIELD_KEYS) {
      const v = String(o[key] ?? '').trim();
      if (v) out[key] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function writeSessionSecrets(secrets: Partial<Record<ConfigSecretFieldKey, string>>): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const compact: Partial<Record<ConfigSecretFieldKey, string>> = {};
    for (const key of CONFIG_SECRET_FIELD_KEYS) {
      const v = String(secrets[key] ?? '').trim();
      if (v) compact[key] = v;
    }
    if (Object.keys(compact).length === 0) {
      sessionStorage.removeItem(SESSION_SECRETS_KEY);
      return;
    }
    sessionStorage.setItem(SESSION_SECRETS_KEY, JSON.stringify(compact));
  } catch {
    /* quota / private mode — memória mantém a sessão actual */
  }
}

/** Mescla segredos do cofre/sessão sobre a config lida do localStorage (já sem plaintext). */
export function mergeConfigSecrets(config: ConfiguracaoSistema): ConfiguracaoSistema {
  if (!vaultHydrated) return config;
  const next = { ...config };
  for (const key of CONFIG_SECRET_FIELD_KEYS) {
    const cached = secretsCache[key];
    if (cached !== undefined && cached !== '') {
      (next as unknown as Record<string, string>)[key] = cached;
    }
  }
  return next;
}

/**
 * Carrega cofre Electron (safeStorage) ou sessão web; migra plaintext legado do localStorage.
 */
export async function hydrateConfigSecretsVault(
  configFromStorage: ConfiguracaoSistema,
): Promise<{ migrated: boolean }> {
  const api = window.isoProDesktop?.loadConfigSecrets;
  if (!api) {
    secretsCache = { ...readSessionSecrets() };
    const plainFromStorage = pickSecretsFromConfig(configFromStorage);
    let migrated = false;
    for (const key of CONFIG_SECRET_FIELD_KEYS) {
      const plain = plainFromStorage[key];
      if (!plain) continue;
      // Qualquer plaintext no localStorage deve sair (mesmo se a sessão já tiver o valor).
      migrated = true;
      if (!secretsCache[key]) secretsCache[key] = plain;
    }
    writeSessionSecrets(secretsCache);
    vaultHydrated = true;
    vaultAvailable = false;
    return { migrated };
  }

  const loadResult = await api();
  if (!loadResult.ok) {
    vaultHydrated = true;
    return { migrated: false };
  }

  vaultAvailable = loadResult.available;
  secretsCache = { ...(loadResult.secrets as Partial<Record<ConfigSecretFieldKey, string>>) };

  if (!loadResult.available) {
    // Electron sem safeStorage: mesmo modelo web (sessão + strip localStorage).
    secretsCache = { ...secretsCache, ...readSessionSecrets() };
    const plainFromStorage = pickSecretsFromConfig(configFromStorage);
    let migrated = false;
    for (const key of CONFIG_SECRET_FIELD_KEYS) {
      const plain = plainFromStorage[key];
      if (plain && !secretsCache[key]) {
        secretsCache[key] = plain;
        migrated = true;
      }
    }
    writeSessionSecrets(secretsCache);
    vaultHydrated = true;
    return { migrated };
  }

  const plainFromStorage = pickSecretsFromConfig(configFromStorage);
  const toMigrate: Partial<Record<ConfigSecretFieldKey, string>> = {};
  for (const key of CONFIG_SECRET_FIELD_KEYS) {
    const plain = plainFromStorage[key];
    if (plain && !secretsCache[key]) {
      toMigrate[key] = plain;
      secretsCache[key] = plain;
    }
  }

  if (Object.keys(toMigrate).length > 0) {
    await window.isoProDesktop?.saveConfigSecrets?.(toMigrate);
  }

  vaultHydrated = true;
  return { migrated: Object.keys(toMigrate).length > 0 };
}

/**
 * Persiste segredos no cofre OS (Electron) ou sessionStorage (web) e remove do JSON em localStorage.
 */
export async function persistConfigSecretsVault(config: ConfiguracaoSistema): Promise<ConfiguracaoSistema> {
  const secrets = pickSecretsFromConfig(config);
  secretsCache = { ...secrets };
  vaultHydrated = true;

  const saveApi = window.isoProDesktop?.saveConfigSecrets;
  if (saveApi && vaultAvailable) {
    await saveApi(secrets);
    return stripSecretsFromConfig(config);
  }

  writeSessionSecrets(secrets);
  return stripSecretsFromConfig(config);
}
