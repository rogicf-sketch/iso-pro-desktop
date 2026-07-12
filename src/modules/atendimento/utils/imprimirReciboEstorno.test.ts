import { describe, expect, it, vi } from 'vitest';
import type { Atendimento } from '../types/atendimento.types';
import { montarHtmlReciboEstorno } from './imprimirReciboEstorno';

vi.mock('../../configuracoes/services/configuracoes.service', () => ({
  readConfiguracoes: vi.fn(() => ({
    documentoRodapeNome: 'I.S.O PRO',
    documentoRodapeCnpj: '66.234.531/0001-57',
  })),
}));

function atendimentoBase(): Atendimento {
  return {
    id: 'a1',
    documentoId: 'd1',
    documentoNumero: 'DOC-1',
    atendente: 'Admin',
    recebedorTipo: 'interno',
    recebedorColaboradorId: null,
    recebedor: 'Joao',
    recebedorEmpresa: '',
    recebedorDocumento: '',
    recebedorTelefone: '',
    autorizadorInterno: '',
    motivoRetirada: '',
    origem: 'windows',
    status: 'concluido',
    dataAtendimento: '2026-06-09T22:00:00.000Z',
    numero: 'ATD-20260609-00040',
    itens: [],
  };
}

describe('imprimirReciboEstorno / layout alinhado ao recibo de atendimento', () => {
  it('usa cabecalho centrado, tabela moderna, assinaturas e CNPJ', () => {
    const html = montarHtmlReciboEstorno({
      atendimento: atendimentoBase(),
      documentoNumero: 'DOC-1',
      documentoRevisao: 'A',
      documentoDescricao: 'Obra teste',
      documentoResponsavel: 'Igor',
      nomeQuemEstorna: 'Admin',
      nomeQuemDevolve: 'Joao',
      motivoEstorno: 'Material devolvido ao estoque',
      estornoParcial: false,
      itensEstorno: [
        {
          id: 'i1',
          documentoItemId: 'x',
          materialId: null,
          codigoMaterial: 'M1',
          descricaoMaterial: 'Parafuso',
          unidade: 'PC',
          quantidadeAtendida: 2,
        },
      ],
    });

    expect(html).toContain('recibo-header-main--titulo-centro');
    expect(html).toContain('Recibo de estorno de material');
    expect(html).toContain('recibo-tabela-itens');
    expect(html).toContain('espaco-assinatura');
    expect(html).toContain('recibo-fechamento');
    expect(html).toContain('CNPJ: 66.234.531/0001-57');
    expect(html).toContain('Responsavel pelo estorno (operador)');
    expect(html).toContain('Total de unidades devolvidas');
    expect(html).not.toContain('I.S.O PRO Desktop');
  });

  it('exibe titulo multi-doc e coluna Documento por item quando lote MULTIPLOS', () => {
    const html = montarHtmlReciboEstorno({
      atendimento: { ...atendimentoBase(), documentoNumero: 'MULTIPLOS' },
      documentoNumero: 'MULTIPLOS',
      documentoTitulo: 'Varios desenhos (ver coluna Documento)',
      documentoRevisao: '—',
      documentoDescricao: 'DES-A: Obra A · DES-B: Obra B',
      documentoResponsavel: '—',
      nomeQuemEstorna: 'Admin',
      nomeQuemDevolve: 'Joao',
      motivoEstorno: 'Devolucao parcial',
      estornoParcial: true,
      itensEstorno: [
        {
          id: 'i1',
          documentoItemId: 'x',
          documentoNumero: 'DES-A',
          materialId: null,
          codigoMaterial: 'M1',
          descricaoMaterial: 'Parafuso',
          unidade: 'PC',
          quantidadeAtendida: 2,
        },
        {
          id: 'i2',
          documentoItemId: 'y',
          documentoNumero: 'DES-B',
          materialId: null,
          codigoMaterial: 'M2',
          descricaoMaterial: 'Porca',
          unidade: 'PC',
          quantidadeAtendida: 1,
        },
      ],
    });

    expect(html).toContain('Varios desenhos (ver coluna Documento)');
    expect(html).toContain('DES-A');
    expect(html).toContain('DES-B');
    expect(html).toContain('Estorno parcial');
  });
});
