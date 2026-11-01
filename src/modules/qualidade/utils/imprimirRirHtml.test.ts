/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import type { RirRegistro } from '../types/qualidade.types';
import {
  juntarEscopoLinhaRir,
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

describe('juntarEscopoLinhaRir', () => {
  it('remove GESTÃO DE MATERIAIS duplicado quando já está no nome da marca', () => {
    expect(
      juntarEscopoLinhaRir('I.S.O PRO GESTÃO DE MATERIAIS', 'GESTÃO DE MATERIAIS'),
    ).toBe('I.S.O PRO GESTÃO DE MATERIAIS');
  });

  it('ignora acentos e maiúsculas ao deduplicar', () => {
    expect(juntarEscopoLinhaRir('I.S.O PRO GESTAO DE MATERIAIS', 'Gestão de Materiais')).toBe(
      'I.S.O PRO GESTAO DE MATERIAIS',
    );
  });

  it('mantém partes distintas', () => {
    expect(juntarEscopoLinhaRir('I.S.O PRO', 'Obra Alfa')).toBe('I.S.O PRO · Obra Alfa');
  });
});

describe('faixa titulo RIR', () => {
  it('folha 1 tem grade INS 3 colunas padronizada', () => {
    const html = montarCabecalhoInspecaoRirHtml(cabParams);
    expect(html).toContain('rir-info-grid');
    expect(html).toContain('rir-context-wrap');
    expect(html).toContain('Contexto do recebimento');
    expect(html).toContain('Nota Fiscal');
    expect(html).toContain('Fornecedor');
    expect(html).toContain('Relatório de inspeção de recebimento');
    expect(html).toContain('Qualidade · Recebimento');
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
  it('laudo observacoes exibe texto completo no selo', async () => {
    const html = await montarHtmlRelatorioRirCompleto(rirMinimo({ laudo: 'observacoes' }));
    expect(html).toContain('APROVADO CONFORME OBSERVAÇÕES');
    expect(html).not.toContain('>CONFORME OBSERVAÇÕES<');
  });

  it('documento v7 premium com assinatura unica e cabecalho repetido', async () => {
    const html = await montarHtmlRelatorioRirCompleto(rirMinimo());
    expect(html).toContain('Relatório v7');
    expect(html).toContain('Documento controlado');
    expect(html).toContain('iso-doc-foot__qr');
    expect(html).not.toContain('I.S.O PRO Desktop');
    expect(html).toContain("font-family: 'Noto Sans'");
    expect(html).toMatch(/\.rir-doc::before/);
    expect(html).toMatch(/rir-sign-space[\s\S]*rir-sign-line/);
    expect(html).toContain('rir-laudo-block');
    expect(html).toContain('rir-laudo-box');
    expect(html).toContain('rir-info-grid');
    expect(html).toContain('rir-thead-repeat');
    expect(html).toContain('rir-context-row');
    expect(html).toContain('rir-footer-row');
    expect(html).toContain('iso-pdf-meta');
    expect(html).toContain('"footerOnly":true');
    expect(html).not.toContain('__relatorioUsaPagedJs = true');
    expect(html).not.toContain('rir-print-sheet');
    expect(html).not.toContain('rir-print-tail-outer');
    expect((html.match(/class="rir-signatures"/g) ?? []).length).toBe(1);
    // Titulo no thead (repete); contexto só no tbody (1.ª folha).
    const theadMatch = html.match(/<thead>[\s\S]*?<\/thead>/);
    expect(theadMatch?.[0]).toContain('Relatório de inspeção de recebimento');
    expect(theadMatch?.[0]).not.toContain('rir-info-grid');
    expect(html).toMatch(/\.rir-sign-card\s*\{\s*text-align:\s*center/);
    expect(html).toMatch(/\.rir-sign-role\s*\{[^}]*color:\s*#44403c/s);
    expect(html).not.toMatch(/\.rir-sign-role\s*\{[^}]*color:\s*#047857/s);
  });

  it('mantem descricao integral do item na tabela', async () => {
    const html = await montarHtmlRelatorioRirCompleto(
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

  it('43 itens em tabela unica com assinatura unica', async () => {
    const itens = Array.from({ length: 43 }, (_, i) => ({
      id: `item-${i}`,
      codigoMaterial: `M${i}`,
      descricaoMaterial: `Material ${i}`,
      quantidade: 1000 + i,
      unidade: 'PÇ',
      certificado: 'N/A',
    }));
    const html = await montarHtmlRelatorioRirCompleto(rirMinimo({ itensRir: itens }));
    expect((html.match(/<tr class="rir-item-row">/g) ?? []).length).toBe(43);
    expect(html).not.toContain('rir-print-sheet');
    expect(html).toContain('rir-footer-row');
    expect(html).toContain('rir-signatures');
    expect((html.match(/class="rir-signatures"/g) ?? []).length).toBe(1);
  });

  it('134 itens tubulacao — rodape na tabela com cabecalho repetido e assinatura unica', async () => {
    const itens = Array.from({ length: 134 }, (_, i) => ({
      id: `item-${i}`,
      codigoMaterial: `5680-E.RAZN008D-TUA-10017_${String(i).padStart(3, '0')}`,
      descricaoMaterial:
        'COTOVELO 90° FM ASTM A197 GALVANIZADO 300# BSP ASME B16.3 2 1/2"',
      quantidade: 1 + (i % 5),
      unidade: 'PÇ',
      certificado: 'CERT-2026-467',
    }));
    const html = await montarHtmlRelatorioRirCompleto(rirMinimo({ itensRir: itens, codigo: 'RIR-TUB-134' }));
    expect((html.match(/<tr class="rir-item-row">/g) ?? []).length).toBe(134);
    expect(html).toContain('rir-footer-row');
    expect(html).not.toContain('rir-print-sheet');
    expect(html).not.toContain('rir-print-tail-outer');
    expect((html.match(/class="rir-signatures"/g) ?? []).length).toBe(1);
  });

  it('20 itens tubulação — numeracao 1..20 sem saltos', async () => {
    const itens = Array.from({ length: 20 }, (_, i) => ({
      id: `item-${i}`,
      codigoMaterial: `5680-E.RAZN008D-TUA-10017_${String(i).padStart(2, '0')}`,
      descricaoMaterial:
        'COTOVELO 90° FM ASTM A197 GALVANIZADO 300# BSP ASME B16.3 2 1/2"',
      quantidade: 1 + i,
      unidade: 'PÇ',
      certificado: 'CERT-2026-467',
    }));
    const html = await montarHtmlRelatorioRirCompleto(rirMinimo({ itensRir: itens, codigo: 'RIR-TUB-02' }));
    expect((html.match(/<tr class="rir-item-row">/g) ?? []).length).toBe(20);
    for (let n = 1; n <= 20; n++) {
      expect(html).toContain(`<td class="rir-c-item">${n}</td>`);
    }
  });

  it('coluna item usa nowrap para digitos lado a lado', async () => {
    const html = await montarHtmlRelatorioRirCompleto(rirMinimo());
    expect(html).toContain('.rir-c-item');
    expect(html).toMatch(/white-space:\s*nowrap/);
  });

  it('formata quantidade com milhar na tabela', async () => {
    const html = await montarHtmlRelatorioRirCompleto(
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
