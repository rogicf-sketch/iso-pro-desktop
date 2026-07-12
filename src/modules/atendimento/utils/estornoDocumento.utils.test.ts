import { describe, expect, it } from 'vitest';
import type { Atendimento, AtendimentoItem } from '../types/atendimento.types';
import {
  atendimentoTemVariosDocumentos,
  encontrarLinhaDocumentoParaItemEstorno,
  resolverIndiceDocumentoParaItemEstorno,
} from './estornoDocumento.utils';

const docs = [
  {
    id: 'doc-a',
    numero: 'DOC-A',
    revisao: 'A',
    descricao: 'A',
    responsavel: 'R',
    status: 'parcial' as const,
    itens: [
      {
        id: 'doc-a-i1',
        codigoMaterial: 'M1',
        descricaoMaterial: 'Mat 1',
        unidade: 'PC',
        quantidadeProjeto: 10,
        quantidadeAtendida: 2,
        localizacao: '',
      },
    ],
  },
  {
    id: 'doc-b',
    numero: 'DOC-B',
    revisao: 'B',
    descricao: 'B',
    responsavel: 'R',
    status: 'parcial' as const,
    itens: [
      {
        id: 'doc-b-i1',
        codigoMaterial: 'M2',
        descricaoMaterial: 'Mat 2',
        unidade: 'PC',
        quantidadeProjeto: 5,
        quantidadeAtendida: 1,
        localizacao: '',
      },
    ],
  },
];

function item(partial: Partial<AtendimentoItem> & Pick<AtendimentoItem, 'id' | 'codigoMaterial'>): AtendimentoItem {
  return {
    documentoItemId: '',
    materialId: null,
    descricaoMaterial: partial.codigoMaterial,
    unidade: 'PC',
    quantidadeAtendida: 1,
    documentoNumero: '',
    ...partial,
  };
}

const atMulti: Atendimento = {
  id: 'atd-m',
  numero: 'ATD-M',
  documentoId: '',
  documentoNumero: 'MULTIPLOS',
  atendente: 'Op',
  recebedorTipo: 'interno',
  recebedorColaboradorId: null,
  recebedor: 'Rec',
  recebedorEmpresa: '',
  recebedorDocumento: '',
  recebedorTelefone: '',
  autorizadorInterno: '',
  motivoRetirada: '',
  origem: 'mobile',
  status: 'concluido',
  dataAtendimento: '2026-06-12T00:00:00.000Z',
  itens: [
    item({ id: 'i1', codigoMaterial: 'M1', documentoItemId: 'doc-a-i1', documentoNumero: 'DOC-A' }),
    item({ id: 'i2', codigoMaterial: 'M2', documentoItemId: 'doc-b-i1', documentoNumero: 'DOC-B' }),
  ],
};

describe('estornoDocumento.utils', () => {
  it('detecta lote MULTIPLOS com varios desenhos', () => {
    expect(atendimentoTemVariosDocumentos(atMulti)).toBe(true);
  });

  it('resolve indice do documento por item quando cabecalho e MULTIPLOS', () => {
    expect(resolverIndiceDocumentoParaItemEstorno(docs, atMulti, atMulti.itens[0]!)).toBe(0);
    expect(resolverIndiceDocumentoParaItemEstorno(docs, atMulti, atMulti.itens[1]!)).toBe(1);
  });

  it('encontra linha do planejamento para estorno', () => {
    const linha = encontrarLinhaDocumentoParaItemEstorno(docs[1]!, atMulti.itens[1]!);
    expect(linha?.id).toBe('doc-b-i1');
  });
});
