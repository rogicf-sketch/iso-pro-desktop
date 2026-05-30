import { describe, expect, it } from 'vitest';
import { findMaterialComCodigoDuplicado } from './materiaisCodigoDuplicado';

describe('findMaterialComCodigoDuplicado', () => {
  const base = [
    { id: '1', codigo: 'MAT-A' },
    { id: '2', codigo: 'MAT-B' },
  ];

  it('detecta duplicata case-insensitive', () => {
    expect(findMaterialComCodigoDuplicado(base, 'mat-a')).toEqual(base[0]);
  });

  it('ignora o registo em edicao', () => {
    expect(findMaterialComCodigoDuplicado(base, 'MAT-A', '1')).toBeUndefined();
  });

  it('permite o mesmo codigo em bases diferentes (multi-tenant e feito na query)', () => {
    expect(findMaterialComCodigoDuplicado([], 'MAT-A')).toBeUndefined();
  });
});
