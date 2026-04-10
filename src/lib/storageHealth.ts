/**
 * Indicadores de armazenamento do *origin* (navegador/Electron para este app).
 * Nao representa o disco inteiro do PC — apenas a cota do ambiente web.
 */

export type StorageHealthSnapshot = {
  originUsageBytes: number | null;
  originQuotaBytes: number | null;
  usoPercent: number | null;
  localStorageEstimateBytes: number;
  deviceMemoryGiB: number | null;
  saudeLabel: 'Saudavel' | 'Atencao' | 'Critico' | 'Indisponivel';
  saudeTone: 'ok' | 'warning' | 'danger' | 'neutral';
};

export function estimateLocalStorageBytes(): number {
  if (typeof localStorage === 'undefined') return 0;
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    const v = localStorage.getItem(k) ?? '';
    total += (k.length + v.length) * 2;
  }
  return total;
}

export function formatBytesPtBr(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let u = 0;
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024;
    u += 1;
  }
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: u === 0 ? 0 : 2 })} ${units[u]}`;
}

export async function getStorageHealthSnapshot(): Promise<StorageHealthSnapshot> {
  let originUsageBytes: number | null = null;
  let originQuotaBytes: number | null = null;

  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      originUsageBytes = typeof est.usage === 'number' ? est.usage : null;
      originQuotaBytes = typeof est.quota === 'number' ? est.quota : null;
    }
  } catch {
    /* ignore */
  }

  const localStorageEstimateBytes = estimateLocalStorageBytes();

  let usoPercent: number | null = null;
  if (originQuotaBytes && originQuotaBytes > 0 && originUsageBytes !== null) {
    usoPercent = Math.min(100, Math.round((originUsageBytes / originQuotaBytes) * 1000) / 10);
  }

  let deviceMemoryGiB: number | null = null;
  try {
    const dm = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (typeof dm === 'number' && Number.isFinite(dm)) deviceMemoryGiB = dm;
  } catch {
    /* ignore */
  }

  let saudeLabel: StorageHealthSnapshot['saudeLabel'] = 'Indisponivel';
  let saudeTone: StorageHealthSnapshot['saudeTone'] = 'neutral';

  if (originQuotaBytes && originQuotaBytes > 0 && usoPercent !== null) {
    if (usoPercent < 75) {
      saudeLabel = 'Saudavel';
      saudeTone = 'ok';
    } else if (usoPercent < 92) {
      saudeLabel = 'Atencao';
      saudeTone = 'warning';
    } else {
      saudeLabel = 'Critico';
      saudeTone = 'danger';
    }
  } else if (originUsageBytes !== null) {
    saudeLabel = 'Saudavel';
    saudeTone = 'ok';
  }

  return {
    originUsageBytes,
    originQuotaBytes,
    usoPercent,
    localStorageEstimateBytes,
    deviceMemoryGiB,
    saudeLabel,
    saudeTone,
  };
}
