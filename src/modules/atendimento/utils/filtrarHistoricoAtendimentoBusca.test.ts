import { describe, expect, it } from 'vitest';
import type { Atendimento } from '../types/atendimento.types';
import { filtrarAtendimentosPorBusca } from './filtrarHistoricoAtendimentoBusca';

function atd(partial: Partial<Atendimento> & Pick<Atendimento, 'id' | 'numero' | 'documentoNumero'>): Atendimento {
  return {
    documentoId: 'd1',
    atendente: 'Maria',
    recebedorTipo: 'interno',
    recebedorColaboradorId: null,
    recebedor: 'Jose',
    recebedorEmpresa: '',
    recebedorDocumento: '',
    recebedorTelefone: '',
    autorizadorInterno: '',
    motivoRetirada: '',
    origem: 'windows',
    status: 'concluido',
    dataAtendimento: '2026-04-03T12:00:00.000Z',
    itens: [],
    ...partial,
  };
}

describe('filtrarAtendimentosPorBusca', () => {
  const lista: Atendimento[] = [
    atd({
      id: 'a1',
      numero: 'ATD-20260403-0001',
      documentoNumero: 'DOC-AJ-99',
      itens: [
        {
          id: 'i1',
          documentoItemId: 'di1',
          materialId: null,
          codigoMaterial: 'ABC-001',
          descricaoMaterial: 'Parafuso especial',
          unidade: 'PC',
          quantidadeAtendida: 2,
        },
      ],
    }),
    atd({
      id: 'a2',
      numero: 'ATD-20260403-0002',
      documentoNumero: 'OUTRO-DOC',
      itens: [],
    }),
  ];

  it('retorna tudo com busca vazia', () => {
    expect(filtrarAtendimentosPorBusca(lista, '')).toEqual(lista);
    expect(filtrarAtendimentosPorBusca(lista, '   ')).toEqual(lista);
  });

  it('filtra por numero do atendimento', () => {
    expect(filtrarAtendimentosPorBusca(lista, '0001')).toHaveLength(1);
    expect(filtrarAtendimentosPorBusca(lista, 'ATD-20260403-0001')[0]?.numero).toBe('ATD-20260403-0001');
  });

  it('filtra por documento', () => {
    expect(filtrarAtendimentosPorBusca(lista, 'AJ-99')).toHaveLength(1);
    expect(filtrarAtendimentosPorBusca(lista, 'OUTRO')).toHaveLength(1);
  });

  it('filtra por codigo ou descricao de material', () => {
    expect(filtrarAtendimentosPorBusca(lista, 'ABC-001')).toHaveLength(1);
    expect(filtrarAtendimentosPorBusca(lista, 'parafuso')).toHaveLength(1);
  });

  it('varias palavras exigem todas (E logico)', () => {
    expect(filtrarAtendimentosPorBusca(lista, 'ATD parafuso')).toHaveLength(1);
    expect(filtrarAtendimentosPorBusca(lista, 'ATD inexistente')).toHaveLength(0);
  });

  it('ignora acentos na busca', () => {
    const comAcento = atd({
      id: 'a3',
      numero: 'ATD-X',
      documentoNumero: 'D',
      recebedor: 'José',
      itens: [],
    });
    expect(filtrarAtendimentosPorBusca([comAcento], 'jose')).toHaveLength(1);
  });
});
