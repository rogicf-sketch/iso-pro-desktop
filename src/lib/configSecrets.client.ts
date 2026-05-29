import type { ConfiguracaoSistema } from '@/modules/configuracoes/types/configuracao.types';

/** Campos sensíveis — no Electron ficam no cofre OS (safeStorage), não em localStorage em texto plano. */
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

let secretsCache: Partial<Record<ConfigSecretFieldKey, string>> = {};
let vaultHydrated = false;
let vaultAvailable = false;

export function isConfigSecretsVaultAvailable(): boolean {
  return vaultAvailable;
}

export function getCachedConfigSecret(key: ConfigSecretFieldKey): string {
  return secretsCache[key] ?? '';
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

/** Mescla segredos do cofre (ou cache) sobre a config lida do localStorage. */
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
 * Carrega cofre Electron (safeStorage) e migra segredos que ainda estejam em localStorage.
 * No browser/web mantém comportamento anterior (segredos só no localStorage).
 */
export async function hydrateConfigSecretsVault(
  configFromStorage: ConfiguracaoSistema,
): Promise<{ migrated: boolean }> {
  const api = window.isoProDesktop?.loadConfigSecrets;
  if (!api) {
    vaultHydrated = true;
    return { migrated: false };
  }

  const loadResult = await api();
  if (!loadResult.ok) {
    vaultHydrated = true;
    return { migrated: false };
  }

  vaultAvailable = loadResult.available;
  secretsCache = { ...(loadResult.secrets as Partial<Record<ConfigSecretFieldKey, string>>) };

  if (!loadResult.available) {
    vaultHydrated = true;
    return { migrated: false };
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

/** Persiste segredos no cofre OS e remove do JSON em localStorage. */
export async function persistConfigSecretsVault(config: ConfiguracaoSistema): Promise<ConfiguracaoSistema> {
  const secrets = pickSecretsFromConfig(config);
  secretsCache = { ...secrets };

  const saveApi = window.isoProDesktop?.saveConfigSecrets;
  if (saveApi && vaultAvailable) {
    await saveApi(secrets);
    return stripSecretsFromConfig(config);
  }

  return config;
}
