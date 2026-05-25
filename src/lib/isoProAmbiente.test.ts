/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ISO_PRO_AMBIENTE_ESTADO_KEY,
  adicionarAmbienteObra,
  readEstadoAmbientes,
  resumoCentroCustoAmbiente,
} from './isoProAmbiente';

describe('isoProAmbiente', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('adicionarAmbienteObra guarda centro de custo no estado', () => {
    const criado = adicionarAmbienteObra('Obra Teste', {
      cliente: 'Cliente X',
      projeto: 'Obra 99',
      contrato: 'CT-1',
      local: 'Norte',
    });
    expect(criado?.centroCusto).toEqual({
      cliente: 'Cliente X',
      projeto: 'Obra 99',
      contrato: 'CT-1',
      local: 'Norte',
    });
    const estado = readEstadoAmbientes();
    const salvo = estado.ambientes.find((a) => a.id === criado?.id);
    expect(salvo?.centroCusto?.cliente).toBe('Cliente X');
    expect(resumoCentroCustoAmbiente(salvo?.centroCusto)).toContain('Cliente X');
  });

  it('readEstadoAmbientes tolera ambientes antigos sem centroCusto', () => {
    localStorage.setItem(
      ISO_PRO_AMBIENTE_ESTADO_KEY,
      JSON.stringify({
        version: 1,
        ativoId: 'padrao',
        ambientes: [{ id: 'padrao', nome: 'Principal' }, { id: 'obra-a', nome: 'Obra A' }],
      }),
    );
    const estado = readEstadoAmbientes();
    expect(estado.ambientes.find((a) => a.id === 'obra-a')?.centroCusto).toBeUndefined();
  });
});
