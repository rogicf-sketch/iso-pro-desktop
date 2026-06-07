/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import type { RirRegistro } from '../types/qualidade.types';
import {
  montarCabecalhoFolhaContinuacaoRirHtml,
  montarCabecalhoInspecaoRirHtml,
  montarHtmlRelatorioRirCompleto,
  montarTheadRirInspecao,
} from './imprimirRirHtml';

function rirMinimo(overrides: Partial<RirRegistro> = {}): RirRegistro {
  return {
    id: 'rir-1',
    codigo: 'RIR-INS-01',
    dataRegistro: '2026-05-30',
    fornecedorNome: 'Endress & Hauser',
    procedimentoNumero: 'PE-INS-001 REV.1',
    disciplina: 'INS',
    uo: 'GESTAO DE MATERIAIS',
    localObra: 'Jaú-SP',
    contratoNumero: '66.234.531/0001-57',
    obsCurta: '',
    observacoesQc: 'OK',
    laudo: 'aprovado',
    status: 'tratado',
    inspecaoQuantitativa: true,
    inspecaoQualitativa: true,
    inspecaoDimensional: false,
    itensRir: [{ id: 'item-1', codigoMaterial: 'M1', descricaoMaterial: 'Mat', quantidade: 1, unidade: 'PÇ', certificado: 'N/A' }],
    assinaturaRecebimento: { nome: 'A', data: '2026-05-30' },
    assinaturaCq: { nome: 'B', data: '2026-05-30' },
    assinaturaCliente: { nome: 'C', data: '2026-05-30' },
    ...overrides,
  } as RirRegistro;
}

const cabParams = {
  logoBlock: '<span>logo</span>',
  escopoLinha: 'GESTAO DE MATERIAIS',
  codigo: 'RIR-INS-01',
  dataRegistro: '30/05/2026',
  emitidoEm: '31/05/2026, 16:14',
  uoExibir: 'GESTAO DE MATERIAIS',
  localExibir: 'Jaú-SP',
  contratoExibir: '66.234.531/0001-57',
  fornecedor: 'Endress',
  nf: 'NF-766253',
  romaneio: 'ROM-246',
  procedimento: 'PE-INS-001 REV.1',
  solCompra: 'N/A',
  disciplina: 'Instrumentação',
  obsCurta: '',
  inspecaoQuantitativa: true,
  inspecaoQualitativa: true,
  inspecaoDimensional: false,
  folhaAtual: 2,
  totalFolhas: 3,
};

const DESC_LONGA =
  'FIO/CABO COM ISOLAÇÃO EM COMPOSTO POLIOLEFÍNICO (PVC) ANTI-CHAMA, CONDUTOR FLEXÍVEL DE COBRE, SEÇÃO NOMINAL 2,5 mm², COR VERMELHA';

describe('faixa titulo RIR', () => {
  it('folha 1 tem grade INS 3 colunas padronizada', () => {
    const html = montarCabecalhoInspecaoRirHtml(cabParams);
    expect(html).toContain('rir-info-grid');
    expect(html).toContain('Nota Fiscal');
    expect(html).toContain('Fornecedor');
    expect(html).toContain('RELATÓRIO DE INSPEÇÃO DE RECEBIMENTO');
    expect(html).not.toContain('Fornecedor e contrato');
  });

  it('folha continuacao usa cabecalho compacto', () => {
    const cont = montarCabecalhoFolhaContinuacaoRirHtml(cabParams);
    expect(cont).toContain('rir-hdr--compact');
    expect(cont).toContain('NF-766253');
    expect(cont).not.toContain('rir-info-grid');
  });
});

describe('montarHtmlRelatorioRirCompleto', () => {
  it('laudo observacoes exibe texto completo no selo', () => {
    const html = montarHtmlRelatorioRirCompleto(rirMinimo({ laudo: 'observacoes' }));
    expect(html).toContain('APROVADO CONFORME OBSERVAÇÕES');
    expect(html).not.toContain('>CONFORME OBSERVAÇÕES<');
  });

  it('documento unico com fluxo continuo v70', () => {
    const html = montarHtmlRelatorioRirCompleto(rirMinimo());
    expect(html).toContain('Relatório v70');
    expect(html).toMatch(/rir-sign-space[\s\S]*rir-sign-line/);
    expect(html).toContain('rir-laudo-block');
    expect(html).toContain('rir-laudo-box');
    expect(html).toContain('rir-info-grid');
    expect(html).toContain('rir-thead-repeat');
    expect(html).toContain('rir-footer-row');
    expect(html).toContain('iso-pdf-meta');
    expect(html).toContain('"footerOnly":true');
    expect(html).not.toContain('rir-print-sheet');
    expect(html).not.toContain('__relatorioUsaPagedJs = true');
  });

  it('mantem descricao integral do item na tabela', () => {
    const html = montarHtmlRelatorioRirCompleto(
      rirMinimo({
        itensRir: [
          {
            id: 'i1',
            codigoMaterial: 'C1',
            descricaoMaterial: DESC_LONGA,
            quantidade: 9800,
            unidade: 'M',
            certificado: 'N/A',
          },
        ],
      }),
    );
    expect(html).toContain('COMPOSTO POLIOLEFÍNICO');
    expect(html).not.toContain('Nota técnica geral');
  });

  it('43 itens numa unica tabela continua', () => {
    const itens = Array.from({ length: 43 }, (_, i) => ({
      id: `item-${i}`,
      codigoMaterial: `M${i}`,
      descricaoMaterial: `Material ${i}`,
      quantidade: 1000 + i,
      unidade: 'PÇ',
      certificado: 'N/A',
    }));
    const html = montarHtmlRelatorioRirCompleto(rirMinimo({ itensRir: itens }));
    expect((html.match(/<tr class="rir-item-row">/g) ?? []).length).toBe(43);
    expect(html).not.toContain('rir-print-sheet');
    expect(html).toContain('rir-signatures');
  });

  it('20 itens tubulação — numeracao 1..20 sem saltos', () => {
    const itens = Array.from({ length: 20 }, (_, i) => ({
      id: `item-${i}`,
      codigoMaterial: `5680-E.RAZN008D-TUA-10017_${String(i).padStart(2, '0')}`,
      descricaoMaterial:
        'COTOVELO 90° FM ASTM A197 GALVANIZADO 300# BSP ASME B16.3 2 1/2"',
      quantidade: 1 + i,
      unidade: 'PÇ',
      certificado: 'CERT-2026-467',
    }));
    const html = montarHtmlRelatorioRirCompleto(rirMinimo({ itensRir: itens, codigo: 'RIR-TUB-02' }));
    expect((html.match(/<tr class="rir-item-row">/g) ?? []).length).toBe(20);
    for (let n = 1; n <= 20; n++) {
      expect(html).toContain(`<td class="rir-c-item">${n}</td>`);
    }
  });

  it('coluna item usa nowrap para digitos lado a lado', () => {
    const html = montarHtmlRelatorioRirCompleto(rirMinimo());
    expect(html).toContain('.rir-c-item');
    expect(html).toMatch(/white-space:\s*nowrap/);
  });

  it('formata quantidade com milhar na tabela', () => {
    const html = montarHtmlRelatorioRirCompleto(
      rirMinimo({
        itensRir: [
          {
            id: 'i1',
            codigoMaterial: 'C1',
            descricaoMaterial: 'Parafuso',
            quantidade: 9800,
            unidade: 'M',
            certificado: 'N/A',
          },
        ],
      }),
    );
    expect(html).toContain('9.800');
  });

  it('thead tem colunas modernas', () => {
    expect(montarTheadRirInspecao()).toContain('Descrição');
  });
});
