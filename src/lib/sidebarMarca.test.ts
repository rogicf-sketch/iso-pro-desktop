import { describe, expect, it } from 'vitest';
import { normalizeSidebarMarcaId } from './sidebarMarca';

describe('sidebarMarca', () => {
  it('normaliza variantes para placa ou icone', () => {
    expect(normalizeSidebarMarcaId('placa')).toBe('placa');
    expect(normalizeSidebarMarcaId('classica')).toBe('placa');
    expect(normalizeSidebarMarcaId('icone')).toBe('icone');
    expect(normalizeSidebarMarcaId('nova')).toBe('icone');
    expect(normalizeSidebarMarcaId('')).toBe('placa');
  });
});
