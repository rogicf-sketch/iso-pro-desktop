import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearOperationalSlo, getOperationalSloSummary, recordOperationalSlo } from './operationalSlo';

describe('operationalSlo', () => {
  afterEach(() => {
    clearOperationalSlo();
    vi.unstubAllGlobals();
  });

  it('agrega eventos e define tone', () => {
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    });

    recordOperationalSlo('snapshot_conflict');
    recordOperationalSlo('dual_write_failure');
    const s = getOperationalSloSummary();
    expect(s.snapshotConflicts).toBe(1);
    expect(s.dualWriteFailures).toBe(1);
    expect(s.tone).toBe('warn');
  });
});
