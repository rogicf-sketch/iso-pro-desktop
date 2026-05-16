import { describe, expect, it } from 'vitest';
import { extrairCodigoMaterialDeObjetoImport } from './codigoMaterialImport';

describe('extrairCodigoMaterialDeObjetoImport', () => {
  it('le snake_case codigo_material (planilhas / JSON legado)', () => {
    expect(
      extrairCodigoMaterialDeObjetoImport({
        codigo_material: 'TB-SP1-VPS001-PSE004',
      }),
    ).toBe('TB-SP1-VPS001-PSE004');
  });

  it('prioriza codigoMaterial quando ambos existem', () => {
    expect(
      extrairCodigoMaterialDeObjetoImport({
        codigoMaterial: 'A',
        codigo_material: 'B',
      }),
    ).toBe('A');
  });
});
