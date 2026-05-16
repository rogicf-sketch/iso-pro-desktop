import { describe, expect, it } from 'vitest';
import { parseConfiguracaoJson } from './configuracaoPersistido.zod';

describe('parseConfiguracaoJson', () => {
  it('aceita objeto com chaves string', () => {
    const out = parseConfiguracaoJson({ tema: 'neon', cliente: 'X' });
    expect(out).toEqual({ tema: 'neon', cliente: 'X' });
  });

  it('rejeita array', () => {
    expect(parseConfiguracaoJson([])).toBeNull();
  });

  it('rejeita primitivo', () => {
    expect(parseConfiguracaoJson('x')).toBeNull();
  });
});
