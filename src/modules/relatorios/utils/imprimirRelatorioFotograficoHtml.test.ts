import { describe, expect, it, vi } from 'vitest';
import { defaultRelatorioFotograficoAssinatura, type RelatorioFotograficoPayload } from '../types/relatorioFotografico.types';
import { montarHtmlRelatorioFotografico } from './imprimirRelatorioFotograficoHtml';

vi.mock('../../configuracoes/services/configuracoes.service', () => ({
  readConfiguracoes: vi.fn(() => ({
    documentoRodapeNome: 'I.S.O PRO',
    documentoRodapeCnpj: '66.234.531/0001-57',
    logoInstitucionalUrl: '',
    logoInstitucionalTamanhoRelatorio: 'auto',
    cliente: 'I.S.O PRO GESTAO DE MATERIAIS',
    projeto: 'GESTAO DE MATERIAIS',
    local: 'Jaú-SP',
  })),
}));

function rfMinimo(overrides: Partial<RelatorioFotograficoPayload> = {}): RelatorioFotograficoPayload {
  return {
    version: 1,
    reportId: 'rf-1',
    salvoEm: '2026-08-30T20:50:00.000Z',
    numeroRelatorio: 'RF-2026-00001',
    titulo: 'Relatório fotográfico',
    observacoes: '',
    rirCodigo: 'RIR-ELE-01',
    recebimentoId: 'rec-1',
    recebimentoLabel: 'NF-163619',
    notaFiscal: '163619',
    fornecedor: 'Cordeiro Cabos Elétricos S.A.',
    romaneio: 'ROM-B10060',
    centroCusto: '',
    projeto: '',
    localObra: '',
    incluirLogoImpressao: true,
    incluirAssinaturasImpressao: false,
    assinaturaRecebimento: defaultRelatorioFotograficoAssinatura(),
    assinaturaQualidade: defaultRelatorioFotograficoAssinatura(),
    assinaturaFiscalizacao: defaultRelatorioFotograficoAssinatura(),
    fotos: [
      {
        id: 'f1',
        dataUrl: 'data:image/png;base64,AAA',
        legenda: 'BOBINA 01',
        etiqueta: 'BOBINA 01',
        createdAt: '2026-08-30T20:00:00.000Z',
        mostrarLegendaImpressao: true,
      },
      {
        id: 'f2',
        dataUrl: 'data:image/png;base64,BBB',
        legenda: 'BOBINA 02',
        etiqueta: '',
        createdAt: '2026-08-30T20:01:00.000Z',
        mostrarLegendaImpressao: true,
      },
    ],
    relatoriosGerados: 1,
    ...overrides,
  };
}

describe('montarHtmlRelatorioFotografico v8 padrao RIR', () => {
  it('usa cabecalho de marca com eyebrow e barra premium', async () => {
    const html = await montarHtmlRelatorioFotografico(rfMinimo());
    expect(html).toContain('class="rf-print-body"');
    expect(html).toContain('Evidência fotográfica · Recebimento');
    expect(html).toContain('Documento oficial de evidência fotográfica');
    expect(html).toContain('RF-2026-00001');
    expect(html).toContain('rf-logo-badge');
    expect(html).toContain("font-family: 'Noto Sans'");
    expect(html).toMatch(/Noto Sans|noto-sans/);
    expect(html).toMatch(/\.rf-doc::before/s);
    expect(html).toContain('v8');
    expect(html).toContain('Documento controlado');
    expect(html).toContain('iso-doc-foot__qr');
    expect(html).not.toContain('I.S.O PRO Desktop');
  });

  it('mostra contexto do recebimento e fotos com moldura', async () => {
    const html = await montarHtmlRelatorioFotografico(rfMinimo());
    expect(html).toContain('Contexto do recebimento');
    expect(html).toContain('Cordeiro Cabos Elétricos S.A.');
    expect(html).toContain('163619');
    expect(html).toContain('ROM-B10060');
    expect(html).toContain('RIR-ELE-01');
    expect(html).toContain('class="rf-foto-frame"');
    expect(html).toContain('<figure class="rf-celula">');
    expect(html).toContain('Foto 01');
    expect(html).toContain('Foto 02 — BOBINA 02');
    expect(html).not.toContain('class="rf-quadro');
  });

  it('inclui assinaturas no padrao RIR so quando pedido', async () => {
    const sem = await montarHtmlRelatorioFotografico(rfMinimo());
    expect(sem).not.toContain('class="rf-signatures"');
    expect(sem).not.toContain('Visto digital');

    const com = await montarHtmlRelatorioFotografico(
      rfMinimo({
        incluirAssinaturasImpressao: true,
        assinaturaQualidade: { nome: 'Ana Lima', data: '2026-08-30' },
      }),
    );
    expect(com).toContain('class="rf-signatures"');
    expect(com).toContain('class="rf-sign-line"');
    expect(com).toContain('Controle de qualidade');
    expect(com).toContain('Ana Lima');
    expect(com).not.toContain('Visto digital');
    expect(com).not.toContain('Pendente');
  });
});

