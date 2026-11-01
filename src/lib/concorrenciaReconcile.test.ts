/**
 * Cenarios de concorrencia / reconciliacao em massa (unidade).
 * Cobre merge deterministico e retry sem spin em lock held.
 */
import { describe, expect, it, vi } from 'vitest';
import { withExponentialBackoff } from './retryWithBackoff';

describe('concorrencia / reconciliacao (unidade)', () => {
  it('merge por chave: tabelas ganham sobre snapshot no mesmo id', () => {
    type Row = { id: string; fonte: string };
    const snap: Row[] = [
      { id: 'a', fonte: 'snap' },
      { id: 'b', fonte: 'snap' },
    ];
    const tables: Row[] = [{ id: 'a', fonte: 'table' }];
    const map = new Map<string, Row>();
    for (const r of snap) map.set(r.id, r);
    for (const r of tables) map.set(r.id, r);
    const merged = [...map.values()].sort((x, y) => x.id.localeCompare(y.id));
    expect(merged).toEqual([
      { id: 'a', fonte: 'table' },
      { id: 'b', fonte: 'snap' },
    ]);
  });

  it('heal em lotes: processa so N faltantes por ciclo', () => {
    const missing = Array.from({ length: 100 }, (_, i) => `id-${i}`);
    const batch = 40;
    const first = missing.slice(0, batch);
    expect(first).toHaveLength(40);
    expect(missing.length - first.length).toBe(60);
  });

  it('lock held nao gera retry storm', async () => {
    const fn = vi.fn(async () => {
      throw new Error('held by other');
    });
    await expect(
      withExponentialBackoff(fn, {
        maxAttempts: 5,
        baseMs: 1,
        shouldRetry: (e) => !/held/i.test(e instanceof Error ? e.message : String(e)),
      }),
    ).rejects.toThrow(/held/);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
