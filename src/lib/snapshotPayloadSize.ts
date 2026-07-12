/** Limites operacionais para alertas de tamanho do snapshot na nuvem. */
export const SNAPSHOT_SIZE_WARN_BYTES = 5 * 1024 * 1024;
export const SNAPSHOT_SIZE_CRITICAL_BYTES = 15 * 1024 * 1024;

export function estimateJsonUtf8Bytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return 0;
  }
}

export function formatSnapshotSize(bytes: number): string {
  const n = Math.max(0, Math.floor(bytes));
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export type SnapshotSizeNivel = 'ok' | 'aviso' | 'critico';

export function classificarTamanhoSnapshot(bytes: number): SnapshotSizeNivel {
  if (bytes >= SNAPSHOT_SIZE_CRITICAL_BYTES) return 'critico';
  if (bytes >= SNAPSHOT_SIZE_WARN_BYTES) return 'aviso';
  return 'ok';
}

export function mensagemTamanhoSnapshot(bytes: number): string | null {
  const nivel = classificarTamanhoSnapshot(bytes);
  const fmt = formatSnapshotSize(bytes);
  if (nivel === 'critico') {
    return `Snapshot na nuvem muito grande (${fmt}). Considere limpar historico antigo ou contactar suporte para migracao parcial.`;
  }
  if (nivel === 'aviso') {
    return `Snapshot na nuvem a crescer (${fmt}). Imports e sincronizacao podem ficar mais lentos.`;
  }
  return null;
}
