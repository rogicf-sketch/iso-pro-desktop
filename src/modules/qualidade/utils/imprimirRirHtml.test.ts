/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import type { RirRegistro } from '../types/qualidade.types';
import { montarHtmlRelatorioRirCompleto } from './imprimirRirHtml';

function rirMinimo(overrides: Partial<RirRegistro> = {}): RirRegistro {
  return {
    id: 'rir-1',
    codigo: 'RIR-TUB-02',
    dataRegistro: '2026-05-29',
    fornecedorNome: 'Fornecedor Teste',
    procedimentoNumero: 'PE-TUB-003',
    recebimentoId: 'rec-1',
    recebimentoNotaFiscal: 'NF-9971122',
    recebimentoRomaneio: 'ROM-2026-018',
    uo: 'GESTAO DE MATERIAIS',
    localObra: 'Jau-SP',
    contratoNumero: '66.234.531/0001-57',
    obsCurta: '',
    observacoesQc: 'OK',
    laudo: 'aprovado',
    status: 'tratado',
    inspecaoQuantitativa: true,
    inspecaoQualitativa: true,
    inspecaoDimensional: false,
    solCompraPackList: '',
    itensRir: Array.from({ length: 20 }, (_, i) => ({
      codigoMaterial: `MAT-${i + 1}`,
      descricaoMaterial: `Material ${i + 1}`,
      quantidade: i + 1,
      unidade: 'PÇ',
      certificado: `CERT-${i + 1}`,
    })),
    assinaturaRecebimento: { nome: 'A', data: '2026-05-29' },
    assinaturaCq: { nome: 'B', data: '2026-05-29' },
    assinaturaCliente: { nome: 'C', data: '2026-05-29' },
    ...overrides,
  } as RirRegistro;
}

describe('montarHtmlRelatorioRirCompleto', () => {
  it('mantem layout classico original com folha e repeticao na impressao', () => {
    const html = montarHtmlRelatorioRirCompleto(rirMinimo());
    expect(html).toContain('rir-classic-top');
    expect(html).toContain('rir-classic-bar">Documentos');
    expect(html).toContain('Material recebido (nota fiscal)');
    expect(html).not.toContain('rir-hform');
    expect(html).toContain('rir-pagenum');
    expect(html).toContain('rir-thead-repeat');
    expect(html).toContain('display: table-header-group');
    expect(html).toContain('counter(page)');
    expect(html).toContain('Relatório de inspeção de recebimento (RIR)');
  });
});
