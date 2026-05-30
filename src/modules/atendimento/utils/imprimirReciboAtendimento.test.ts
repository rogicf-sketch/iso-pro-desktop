import { describe, expect, it, vi } from 'vitest';
import type { Atendimento, DadosReciboSessaoConsolidada } from '../types/atendimento.types';
import { montarHtmlReciboConsolidado } from './imprimirReciboAtendimento';

vi.mock('../../configuracoes/services/configuracoes.service', () => ({
  readConfiguracoes: vi.fn(() => ({
    documentoRodapeNome: 'I.S.O PRO',
    documentoRodapeCnpj: '66.234.531/0001-57',
  })),
}));

function atendimentoBase(partial: Partial<Atendimento> & Pick<Atendimento, 'numero' | 'documentoNumero'>): Atendimento {
  return {
    id: 'a1',
    documentoId: 'd1',
    atendente: 'Igor',
    recebedorTipo: 'interno',
    recebedorColaboradorId: null,
    recebedor: 'Gabriel',
    recebedorEmpresa: '',
    recebedorDocumento: '',
    recebedorTelefone: '',
    autorizadorInterno: '',
    motivoRetirada: '',
    origem: 'windows',
    status: 'concluido',
    dataAtendimento: '2026-05-29T22:44:05.000Z',
    itens: [],
    ...partial,
  };
}

describe('imprimirReciboAtendimento / recibo consolidado', () => {
  it('inclui todas as secoes de documento e estilos de assinatura', () => {
    const dados: DadosReciboSessaoConsolidada = {
      referencia: 'SESSAO-1',
      dataAtendimento: '2026-05-29T22:44:05.000Z',
      atendente: 'Igor',
      recebedorTipo: 'interno',
      nomeAtendido: 'Gabriel',
      recebedor: 'Gabriel',
      numerosLotes: ['ATD-20260529-0003', 'ATD-20260529-0004'],
      secoes: [
        {
          documentoRevisao: 'C',
          documentoDescricao: 'LISTA MATERIAS DE ATERRAMENTO E SPDA',
          documentoResponsavel: 'Igor',
          atendimento: atendimentoBase({
            numero: 'ATD-20260529-0003',
            documentoNumero: 'E.RAZN010-IE6-00002-ABOVE',
            itens: [
              {
                id: 'i1',
                documentoItemId: 'x',
                materialId: null,
                codigoMaterial: 'ATER0005',
                descricaoMaterial: 'Rebite',
                unidade: 'PC',
                quantidadeAtendida: 20,
              },
            ],
          }),
        },
        {
          documentoRevisao: 'A',
          documentoDescricao: 'LISTA DE CABOS BROWNFIELD',
          documentoResponsavel: 'Igor',
          atendimento: atendimentoBase({
            numero: 'ATD-20260529-0004',
            documentoNumero: 'E.RAZN010-IE6-00008-UNDER',
            itens: [
              {
                id: 'i2',
                documentoItemId: 'y',
                materialId: null,
                codigoMaterial: 'EPRD10PPN4C_1_50',
                descricaoMaterial: 'Cabo EPR',
                unidade: 'M',
                quantidadeAtendida: 3139,
              },
            ],
          }),
        },
      ],
    };

    const html = montarHtmlReciboConsolidado(dados);

    expect(html).toContain('E.RAZN010-IE6-00002-ABOVE');
    expect(html).toContain('E.RAZN010-IE6-00008-UNDER');
    expect(html).toContain('recibo-secao-doc');
    expect(html).toContain('class="assinaturas"');
    expect(html).toContain('Total geral de unidades');
    expect(html).not.toContain('panel-copy');
  });
});
