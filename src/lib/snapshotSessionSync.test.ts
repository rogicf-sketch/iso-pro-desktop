/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ISO_PRO_SNAPSHOT_CONFLICT_EVENT,
  ISO_PRO_SNAPSHOT_REFRESH_EVENT,
  notifySnapshotConflict,
  requestSnapshotRefresh,
} from './snapshotSessionSync';

afterEach(() => vi.restoreAllMocks());

describe('snapshotSessionSync', () => {
  it('dispara evento de conflito com o detalhe', () => {
    const spy = vi.fn();
    window.addEventListener(ISO_PRO_SNAPSHOT_CONFLICT_EVENT, spy as EventListener);
    notifySnapshotConflict({ message: 'divergencia' });
    window.removeEventListener(ISO_PRO_SNAPSHOT_CONFLICT_EVENT, spy as EventListener);

    expect(spy).toHaveBeenCalledTimes(1);
    const evt = spy.mock.calls[0][0] as CustomEvent;
    expect(evt.detail).toEqual({ message: 'divergencia' });
  });

  it('dispara pedido de refresh com o motivo', () => {
    const spy = vi.fn();
    window.addEventListener(ISO_PRO_SNAPSHOT_REFRESH_EVENT, spy as EventListener);
    requestSnapshotRefresh({ reason: 'pos-estorno' });
    window.removeEventListener(ISO_PRO_SNAPSHOT_REFRESH_EVENT, spy as EventListener);

    const evt = spy.mock.calls[0][0] as CustomEvent;
    expect(evt.detail).toEqual({ reason: 'pos-estorno' });
  });

  it('os nomes dos eventos sao estaveis (contrato entre abas/clientes)', () => {
    expect(ISO_PRO_SNAPSHOT_CONFLICT_EVENT).toBe('iso-pro-snapshot-conflict');
    expect(ISO_PRO_SNAPSHOT_REFRESH_EVENT).toBe('iso-pro-snapshot-refresh-request');
  });
});
