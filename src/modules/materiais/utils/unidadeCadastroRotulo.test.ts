import { describe, expect, it } from 'vitest';
import { normalizarSiglaUnidade, rotuloUnidadeCadastro } from './unidadeCadastroRotulo';

describe('unidadeCadastroRotulo', () => {
  it('mostra sigla e significado no cadastro de unidades', () => {
    expect(rotuloUnidadeCadastro('UN')).toBe('UN — Unidade');
    expect(rotuloUnidadeCadastro('m')).toBe('M — Metro');
    expect(rotuloUnidadeCadastro('PC')).toBe('PC — Peça');
    expect(rotuloUnidadeCadastro('KG')).toBe('KG — Quilograma');
  });

  it('aceita descrição extra (unidades personalizadas)', () => {
    expect(rotuloUnidadeCadastro('CX', { CX: 'Caixa' })).toBe('CX — Caixa');
  });

  it('sem descrição conhecida devolve só a sigla', () => {
    expect(rotuloUnidadeCadastro('XYZ')).toBe('XYZ');
  });

  it('normaliza sigla em maiúsculas', () => {
    expect(normalizarSiglaUnidade('  pc ')).toBe('PC');
  });
});
