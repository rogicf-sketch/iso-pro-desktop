import { describe, expect, it } from 'vitest';
import { parseSupabaseSavedConfigRoot } from './supabaseSavedConfig.zod';

describe('parseSupabaseSavedConfigRoot', () => {
  it('aceita objeto plano', () => {
    expect(parseSupabaseSavedConfigRoot({ url: 'u', materiaisNuvem: true })).toEqual({ url: 'u', materiaisNuvem: true });
  });

  it('rejeita array no topo', () => {
    expect(parseSupabaseSavedConfigRoot([])).toBeNull();
  });
});
