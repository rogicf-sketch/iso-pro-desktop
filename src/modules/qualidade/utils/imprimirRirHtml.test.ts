/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import type { RirRegistro } from '../types/qualidade.types';
import { montarHtmlRelatorioRirCompleto } from './imprimirRirHtml';

function rirMinimo(): RirRegistro {
  return {
    id: 'rir-1',
    codigo: 'RIR-TUB-02',
    dataRegistro: '2026-05-29',
    fornecedorNome: 'Fornecedor',
    procedimentoNumero: 'PE-1',
    uo: 'Obra',
    localObra: 'Local',
    contratoNumero: 'C-1',
    obsCurta: '',
    observacoesQc: 'OK',
    laudo: 'aprovado',
    status: 'tratado',
    inspecaoQuantitativa: true,
    inspecaoQualitativa: true,
    inspecaoDimensional: false,
    itensRir: [{ codigoMaterial: 'M1', descricaoMaterial: 'Mat', quantidade: 1, unidade: 'UN', certificado: 'C1' }],
    assinaturaRecebimento: { nome: 'A', data: '2026-05-29' },
    assinaturaCq: { nome: 'B', data: '2026-05-29' },
    assinaturaCliente: { nome: 'C', data: '2026-05-29' },
  } as RirRegistro;
}

describe('montarHtmlRelatorioRirCompleto / cabecalho repetido', () => {
  it('mantem visual classico e coloca cabecalho no thead para repetir na impressao', () => {
    const html = montarHtmlRelatorioRirCompleto(rirMinimo());
    expect(html).toContain('rir-classic-top');
    expect(html).toContain('rir-thead-repeat');
    expect(html).toContain('Material recebido (nota fiscal)');
    expect(html).toContain('display: table-header-group');
    expect(html).not.toMatch(/<header class="rir-classic-top">[\s\S]*<header class="rir-classic-top">/);
  });
});
