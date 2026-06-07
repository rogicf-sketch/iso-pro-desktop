/**
 * Ligacao Supabase ao nivel da instalacao (nao por tenant).
 * Um projecto Supabase pode ter varias empresas; URL/chave sao partilhadas neste PC.
 */

import { getIsoProInstalacaoStorageKey, parseIsoProStorageKey } from './isoProAmbiente';

export const ISO_PRO_CLOUD_CONNECTION_KEY_BASE = 'iso-pro-desktop-cloud-connection-v1';

export type IsoProCloudConnectionPersisted = {
  version: 1;
  supabaseUrl: string;
  supabaseAnonKey: string;
  materiaisNuvem: boolean;
};

function cloudConnectionStorageKey(): string {
  return getIsoProInstalacaoStorageKey(ISO_PRO_CLOUD_CONNECTION_KEY_BASE);
}

function normalizePersisted(raw: unknown): IsoProCloudConnectionPersisted | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<IsoProCloudConnectionPersisted>;
  if (o.version !== 1) return null;
  return {
    version: 1,
    supabaseUrl: String(o.supabaseUrl ?? '').trim(),
    supabaseAnonKey: String(o.supabaseAnonKey ?? '').trim(),
    materiaisNuvem: o.materiaisNuvem === true,
  };
}

export function readIsoProCloudConnection(): IsoProCloudConnectionPersisted | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(cloudConnectionStorageKey());
    if (!raw) return null;
    return normalizePersisted(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeIsoProCloudConnection(partial: {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  materiaisNuvem?: boolean;
}): IsoProCloudConnectionPersisted {
  const prev = readIsoProCloudConnection();
  const next: IsoProCloudConnectionPersisted = {
    version: 1,
    supabaseUrl: partial.supabaseUrl !== undefined ? partial.supabaseUrl.trim() : (prev?.supabaseUrl ?? ''),
    supabaseAnonKey:
      partial.supabaseAnonKey !== undefined ? partial.supabaseAnonKey.trim() : (prev?.supabaseAnonKey ?? ''),
    materiaisNuvem: partial.materiaisNuvem !== undefined ? partial.materiaisNuvem === true : (prev?.materiaisNuvem ?? false),
  };
  localStorage.setItem(cloudConnectionStorageKey(), JSON.stringify(next));
  return next;
}

/** Copia credenciais guardadas em chaves tenant-scoped (legado) para o armazenamento da instalacao. */
export function migrarCloudConnectionLegadoTenantSeNecessario(): void {
  if (typeof localStorage === 'undefined') return;
  const atual = readIsoProCloudConnection();
  if (atual?.supabaseUrl && atual.supabaseAnonKey) return;

  const legacyBase = 'iso-pro-desktop-configuracoes-sistema';
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    const { base } = parseIsoProStorageKey(key);
    if (base !== legacyBase) continue;
    try {
      const parsed = JSON.parse(localStorage.getItem(key) ?? 'null') as Record<string, unknown> | null;
      if (!parsed || typeof parsed !== 'object') continue;
      const url = String(parsed.supabaseUrl ?? parsed.url ?? '').trim();
      const anonKey = String(parsed.supabaseAnonKey ?? parsed.key ?? '').trim();
      if (!url || !anonKey) continue;
      writeIsoProCloudConnection({
        supabaseUrl: url,
        supabaseAnonKey: anonKey,
        materiaisNuvem: parsed.materiaisNuvem === true,
      });
      return;
    } catch {
      /* tenta proxima chave legada */
    }
  }
}

/** Le credenciais da instalacao; tenta migracao legada uma vez. */
export function readIsoProCloudConnectionComMigracao(): IsoProCloudConnectionPersisted | null {
  migrarCloudConnectionLegadoTenantSeNecessario();
  return readIsoProCloudConnection();
}

/** Chaves legadas tenant-scoped a ignorar para URL/chave (diagnostico). */
export function isLegacyTenantScopedConfigKey(fullKey: string): boolean {
  const { base, tenantId } = parseIsoProStorageKey(fullKey);
  return base === 'iso-pro-desktop-configuracoes-sistema' && tenantId !== null;
}

export function getIsoProCloudConnectionStorageKeyForDiagnostics(): string {
  return cloudConnectionStorageKey();
}