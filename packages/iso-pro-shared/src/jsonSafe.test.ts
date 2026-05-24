import { describe, expect, it } from 'vitest';
import { stripJsonPollution } from './jsonSafe.js';

describe('stripJsonPollution', () => {
  it('remove chaves __proto__, constructor e prototype', () => {
    const input = {
      ok: 1,
      __proto__: { polluted: true },
      nested: {
        constructor: { x: 1 },
        prototype: 2,
        keep: 3,
      },
    };
    const out = stripJsonPollution<Record<string, unknown>>(input);
    expect(out).toEqual({
      ok: 1,
      nested: { keep: 3 },
    });
  });

  it('preserva arrays e primitivos', () => {
    expect(stripJsonPollution(null)).toBeNull();
    expect(stripJsonPollution('x')).toBe('x');
    expect(stripJsonPollution([1, { a: 2 }])).toEqual([1, { a: 2 }]);
  });

  it('objeto vazio permanece vazio', () => {
    expect(stripJsonPollution({})).toEqual({});
  });

  it('referência circular: segundo acesso ao mesmo objecto devolve null no ramo repetido', () => {
    const a: Record<string, unknown> = { name: 'a' };
    const b: Record<string, unknown> = { name: 'b', ref: a };
    a.back = b;
    const out = stripJsonPollution(a) as Record<string, unknown>;
    expect(out.name).toBe('a');
    expect(out.back).toEqual({ name: 'b', ref: null });
  });

  it('profundidade muito grande não lança e devolve estrutura finita', () => {
    let deep: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < 60; i += 1) {
      deep = { nest: deep };
    }
    expect(() => stripJsonPollution(deep)).not.toThrow();
    const out = stripJsonPollution(deep);
    expect(out).toBeTruthy();
    expect(typeof out).toBe('object');
  });
});
