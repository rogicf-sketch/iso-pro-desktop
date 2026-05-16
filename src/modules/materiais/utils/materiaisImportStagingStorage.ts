import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';
import { isBusinessLocalWriteBlocked } from '../../../lib/writePolicy';
import { parseMateriaisImportStagingStored } from '../schemas/materiaisImportStaging.zod';
import { previewImportacaoMateriaisCsv } from '../services/materiais.service';

export function materiaisImportStagingStorageKey(): string {
  return getScopedIsoProStorageKey('iso-pro-materiais-import-staging-v1');
}
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Margem abaixo do limite tipico de localStorage (~5 MiB) para UTF-8. */
const MAX_JSON_BYTES = 4_500_000;

export type MateriaisImportStagingState = {
  fileName: string;
  text: string;
  linhaCount: number;
};

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
    const raw = window.localStorage.getItem(materiaisImportStagingStorageKey());
    if (!raw) return null;
    let jsonParsed: unknown;
    try {
      jsonParsed = JSON.parse(raw);
    } catch {
      window.localStorage.removeItem(materiaisImportStagingStorageKey());
      return null;
    }
    const parsed = parseMateriaisImportStagingStored(jsonParsed);
    if (!parsed) {
      window.localStorage.removeItem(materiaisImportStagingStorageKey());
      return null;
    }
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(materiaisImportStagingStorageKey());
      return null;
    }
    const preview = previewImportacaoMateriaisCsv(parsed.text);
    if (!preview.ok) {
      window.localStorage.removeItem(materiaisImportStagingStorageKey());
      return null;
    }
    return {
      fileName: parsed.fileName,
      text: parsed.text,
      linhaCount: preview.linhaCount,
    };
  } catch {
    try {
      window.localStorage.removeItem(materiaisImportStagingStorageKey());
    } catch {
      /* ignore */
    }
    return null;
  }
}

export function persistMateriaisImportStaging(state: MateriaisImportStagingState | null): void {
  if (!canUseLocalStorage()) return;
  if (state !== null && isBusinessLocalWriteBlocked()) return;
  try {
    if (!state) {
      window.localStorage.removeItem(materiaisImportStagingStorageKey());
      return;
    }
    const payload = { ...state, savedAt: Date.now() };
    const json = JSON.stringify(payload);
    if (payloadByteLength(json) > MAX_JSON_BYTES) {
      return;
    }
    window.localStorage.setItem(materiaisImportStagingStorageKey(), json);
  } catch {
    /* quota exceeded or storage disabled */
  }
}
