import { describe, expect, it, vi } from 'vitest';
import type { Atendimento, DadosReciboSessaoConsolidada } from '../types/atendimento.types';
import { montarHtmlRecibo, montarHtmlReciboConsolidado } from './imprimirReciboAtendimento';

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

describe('imprimirReciboAtendimento / recibo consolidado v6', () => {
  it('recibo simples usa cabeçalho premium, badge interna e rodapé v6', async () => {
    const html = await montarHtmlRecibo({
      atendimento: atendimentoBase({
        numero: 'ATD-1',
        documentoNumero: 'DOC-1',
        atendente: 'Admin',
        recebedor: 'Igor',
        itens: [
          {
            id: 'i1',
            documentoItemId: 'x',
            materialId: null,
            codigoMaterial: 'M1',
            descricaoMaterial: 'Material teste',
            unidade: 'PC',
            quantidadeAtendida: 2,
          },
        ],
      }),
      documentoRevisao: 'A',
      documentoDescricao: 'Obra teste',
      documentoResponsavel: 'Resp',
      nomeAtendido: 'Igor',
    });

    expect(html).toContain('recibo-tipo-badge');
    expect(html).toContain('recibo-rodape-fin');
    expect(html).toContain('recibo-hdr');
    expect(html).toContain('recibo-logo-badge');
    expect(html).toContain('Atendimento · Almoxarifado');
    expect(html).toContain('espaco-assinatura');
    expect(html).toContain('recibo-tabela-itens');
    expect(html).toContain('Retirada interna');
    expect(html).toContain('· v6');
    expect(html).not.toContain('>Retirada interna</h2>');
    expect(html).toMatch(/\.recibo-fechamento\s*\{[^}]*page-break-inside:\s*auto/s);
    expect(html).toMatch(/\.espaco-assinatura\s*\{[^}]*min-height:\s*28px/s);
    expect(html).toMatch(/<body class="recibo-body"/);
    expect(html).not.toMatch(/<body class="recibo-body recibo-body--denso"/);
  });

  it('recibo simples com varios desenhos inclui coluna Documento por item', async () => {
    const html = await montarHtmlRecibo({
      atendimento: atendimentoBase({
        numero: 'ATD-20260610-00042',
        documentoNumero: 'MULTIPLOS',
        atendente: 'Admin',
        recebedor: 'Jonatas',
        itens: [
          {
            id: 'i1',
            documentoItemId: 'x',
            materialId: null,
            codigoMaterial: 'PL0001',
            descricaoMaterial: 'Junta',
            unidade: 'PC',
            quantidadeAtendida: 2,
            documentoNumero: 'BGC-18"-BT-044-SS1-NI',
          },
          {
            id: 'i2',
            documentoItemId: 'y',
            materialId: null,
            codigoMaterial: 'ATER0006',
            descricaoMaterial: 'Rebite',
            unidade: 'PC',
            quantidadeAtendida: 1,
            documentoNumero: 'E.RAZN010-IE6-00002-ABOVE',
          },
        ],
      }),
      documentoRevisao: '—',
      documentoDescricao: 'Varios desenhos',
      documentoResponsavel: '—',
      nomeAtendido: 'Jonatas',
    });

    expect(html).toContain('Vários desenhos (ver coluna Documento)');
    expect(html).toContain('<th class="col-doc">Documento</th>');
    expect(html).toContain('BGC-18&quot;-BT-044-SS1-NI');
    expect(html).toContain('E.RAZN010-IE6-00002-ABOVE');
  });

  it('inclui todas as secoes de documento e estilos de assinatura', async () => {
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

    const html = await montarHtmlReciboConsolidado(dados);

    expect(html).toContain('E.RAZN010-IE6-00002-ABOVE');
    expect(html).toContain('E.RAZN010-IE6-00008-UNDER');
    expect(html).toContain('recibo-secao-doc');
    expect(html).toContain('recibo-hdr');
    expect(html).toContain('class="assinaturas"');
    expect(html).toContain('recibo-tabela-itens');
    expect(html).toMatch(/linha-ass[\s\S]*ass-nome-principal/);
    expect(html).toContain('Total geral de unidades');
    expect(html).toContain('· v6');
    expect(html).not.toContain('panel-copy');
  });
});
