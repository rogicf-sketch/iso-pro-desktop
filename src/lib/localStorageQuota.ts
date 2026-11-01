/**
 * Recuperacao quando o browser/Electron enche a quota ~5 MB do localStorage.
 * Caches de cadastro sao descartaveis (SoT = nuvem); sessao/credenciais nao.
 */

import { isIsoProManagedStorageKey } from './isoProAmbiente';

const PRESERVE_SUBSTR = [
  'iso-pro-desktop-session',
  'iso-pro-desktop-usuarios',
  'iso-pro-auth-permanecer-logado',
  'iso-pro-auth-last-activity',
  'iso-pro-desktop-cloud',
  'iso-pro-desktop-ambientes-estado',
  'iso-pro-desktop-jwt',
  'jwt-auth-opt-in',
  'supabase',
] as const;

function devePreservarChave(key: string): boolean {
  const k = key.toLowerCase();
  return PRESERVE_SUBSTR.some((p) => k.includes(p.toLowerCase()));
}

export function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: number; message?: string };
  if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
  if (e.code === 22) return true;
  const msg = String(e.message ?? '');
  return /quota/i.test(msg) || /exceeded the quota/i.test(msg);
}

/** Remove caches I.S.O PRO grandes; mantem sessao, users e config de nuvem. */
export function liberarCachesLocalStorageIsoPro(): number {
  if (typeof localStorage === 'undefined') return 0;
  const aRemover: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (!isIsoProManagedStorageKey(key)) continue;
    if (devePreservarChave(key)) continue;
    aRemover.push(key);
  }
  for (const key of aRemover) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  return aRemover.length;
}

/**
 * Grava no Storage; se quota encher, limpa caches e tenta de novo.
 * @throws Error em portugues se ainda falhar
 */
export function setItemComRecuperacaoQuota(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
    return;
  } catch (err) {
    if (!isQuotaExceededError(err)) throw err;
  }
  liberarCachesLocalStorageIsoPro();
  try {
    storage.setItem(key, value);
  } catch (err) {
    if (isQuotaExceededError(err)) {
      throw new Error(
        'Armazenamento local cheio neste equipamento. Limpe os dados do site (Ctrl+Shift+Delete) ou em Configuracoes > limpeza local, e tente entrar de novo.',
      );
    }
    throw err;
  }
}
