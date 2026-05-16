import { describe, expect, it } from 'vitest';
import { parseEquipamentosPersistidos } from './equipamentoPersistido.zod';

const row = {
  id: '1',
  codigo: 'A',
  tipoEquipamento: 'Escavadeira',
  placa: 'ABC-0001',
  nomeOperador: 'Joao',
  telefoneOperador: '',
  setorResponsavel: 'Obra',
  empresaContratada: 'Empresa X',
  dataInicioProjeto: '2026-01-01',
  dataFimContrato: '2026-12-31',
  valorContrato: null as number | null,
  numeroContrato: 'C-1',
  statusEquipamento: 'operando' as const,
  observacoes: '',
  dataCadastro: '2026-01-01T00:00:00.000Z',
};

describe('parseEquipamentosPersistidos', () => {
  it('aceita lista válida', () => {
    expect(parseEquipamentosPersistidos([row])).toEqual([row]);
  });

  it('rejeita status invalido', () => {
    expect(parseEquipamentosPersistidos([{ ...row, statusEquipamento: 'x' as 'operando' }])).toBeNull();
  });
});
