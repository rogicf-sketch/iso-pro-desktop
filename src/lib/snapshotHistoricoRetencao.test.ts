import { describe, expect, it } from 'vitest';
import { trimAtendimentoHistoricoArray } from './snapshotHistoricoRetencao';

describe('trimAtendimentoHistoricoArray', () => {
  it('remove itens antigos e limita quantidade', () => {
    const now = Date.parse('2026-07-22T12:00:00.000Z');
    const items = [
      { id: 'old', data: '2025-01-01T00:00:00.000Z' },
      { id: 'mid', data: '2026-06-01T00:00:00.000Z' },
      { id: 'new', data: '2026-07-20T00:00:00.000Z' },
      { id: 'new2', data: '2026-07-21T00:00:00.000Z' },
    ];
    const r = trimAtendimentoHistoricoArray(items, {
      maxAgeDays: 90,
      maxItems: 2,
      nowMs: now,
    });
    expect(r.removed).toBe(2);
    expect(r.items.map((x) => x.id)).toEqual(['new2', 'new']);
  });
});
