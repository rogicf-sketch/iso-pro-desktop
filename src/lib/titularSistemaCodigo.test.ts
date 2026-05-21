import { describe, expect, it } from 'vitest';
import { getTitularSistemaLinhaResumo, ISO_PRO_TITULAR_SISTEMA_CNPJ, ISO_PRO_TITULAR_SISTEMA_NOME } from './titularSistemaCodigo';

describe('titularSistemaCodigo', () => {
  it('exibe apenas CNPJ quando nome do titular esta vazio', () => {
    expect(ISO_PRO_TITULAR_SISTEMA_NOME.trim()).toBe('');
    expect(ISO_PRO_TITULAR_SISTEMA_CNPJ.trim()).toBe('66.234.531/0001-57');
    expect(getTitularSistemaLinhaResumo()).toBe('66.234.531/0001-57');
  });

  it('nao inclui prefixo Nome quando so ha CNPJ', () => {
    const linha = getTitularSistemaLinhaResumo();
    expect(linha).not.toBeNull();
    expect(linha).not.toMatch(/^Nome:/);
    expect(linha).not.toContain('Igor');
  });
});
