/** Eventos de sincronização do snapshot entre abas / clientes (web, desktop, mobile). */

export const ISO_PRO_SNAPSHOT_CONFLICT_EVENT = 'iso-pro-snapshot-conflict';
export const ISO_PRO_SNAPSHOT_REFRESH_EVENT = 'iso-pro-snapshot-refresh-request';

export function notifySnapshotConflict(detail?: { message?: string }) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ISO_PRO_SNAPSHOT_CONFLICT_EVENT, { detail }));
}

export function requestSnapshotRefresh(detail?: { reason?: string }) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ISO_PRO_SNAPSHOT_REFRESH_EVENT, { detail }));
}
