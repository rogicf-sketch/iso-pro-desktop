import { previewImportacaoMateriaisCsv } from '../services/materiais.service';

export const MATERIAIS_IMPORT_STAGING_STORAGE_KEY = 'iso-pro-materiais-import-staging-v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Margem abaixo do limite tipico de localStorage (~5 MiB) para UTF-8. */
const MAX_JSON_BYTES = 4_500_000;

export type MateriaisImportStagingState = {
  fileName: string;
  text: string;
  linhaCount: number;
};

type StoredPayload = MateriaisImportStagingState & { savedAt: number };

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function payloadByteLength(json: string): number {
  return new TextEncoder().encode(json).length;
}

/**
 * Restaura o modal "Confirmar importacao" apos recarregar ou reabrir a app (Electron/navegador).
 * Revalida o CSV; entradas expiradas ou invalidas sao removidas.
 */
export function loadPersistedMateriaisImportStaging(): MateriaisImportStagingState | null {
  if (!canUseLocalStorage()) return null;
  try {
    const raw = window.localStorage.getItem(MATERIAIS_IMPORT_STAGING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPayload;
    if (
      typeof parsed.fileName !== 'string' ||
      typeof parsed.text !== 'string' ||
      typeof parsed.linhaCount !== 'number' ||
      typeof parsed.savedAt !== 'number'
    ) {
      window.localStorage.removeItem(MATERIAIS_IMPORT_STAGING_STORAGE_KEY);
      return null;
    }
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(MATERIAIS_IMPORT_STAGING_STORAGE_KEY);
      return null;
    }
    const preview = previewImportacaoMateriaisCsv(parsed.text);
    if (!preview.ok) {
      window.localStorage.removeItem(MATERIAIS_IMPORT_STAGING_STORAGE_KEY);
      return null;
    }
    return {
      fileName: parsed.fileName,
      text: parsed.text,
      linhaCount: preview.linhaCount,
    };
  } catch {
    try {
      window.localStorage.removeItem(MATERIAIS_IMPORT_STAGING_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}

export function persistMateriaisImportStaging(state: MateriaisImportStagingState | null): void {
  if (!canUseLocalStorage()) return;
  try {
    if (!state) {
      window.localStorage.removeItem(MATERIAIS_IMPORT_STAGING_STORAGE_KEY);
      return;
    }
    const payload: StoredPayload = { ...state, savedAt: Date.now() };
    const json = JSON.stringify(payload);
    if (payloadByteLength(json) > MAX_JSON_BYTES) {
      return;
    }
    window.localStorage.setItem(MATERIAIS_IMPORT_STAGING_STORAGE_KEY, json);
  } catch {
    /* quota exceeded or storage disabled */
  }
}
