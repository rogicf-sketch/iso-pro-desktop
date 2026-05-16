import { describe, expect, it } from 'vitest';
import { parseAuthAuditEventsList } from './authAuditLocal.zod';

const event = {
  id: 'e1',
  type: 'login_success' as const,
  actorLogin: 'a',
  detail: 'd',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('parseAuthAuditEventsList', () => {
  it('aceita lista valida', () => {
    expect(parseAuthAuditEventsList([event])).toEqual([event]);
  });

  it('rejeita tipo desconhecido', () => {
    expect(
      parseAuthAuditEventsList([
        {
          ...event,
          type: 'unknown_event',
        },
      ]),
    ).toBeNull();
  });
});
