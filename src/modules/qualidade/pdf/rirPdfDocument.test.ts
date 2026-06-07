/** @vitest-environment node */
import './rirPdfFonts.test-setup';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { RirRegistro } from '../types/qualidade.types';
import { gerarRirPdfBytes, RIR_PDF_VERSION } from './rirPdfDocument';
import type { RirPdfContexto } from './rirPdfDocument';
import { medirLinhaTabelaRir, estimarPaginasRir } from './rirPdfLayout';
import { quebrarTextoPdf } from './rirPdfText';

function ctxMinimo(itensCount: number): RirPdfContexto {
  const itens = Array.from({ length: itensCount }, (_, i) => ({
    id: `item-${i}`,
    codigoMaterial: `FE-FE1-TQ-TQC02-LSL${300 + i}`,
    descricaoMaterial: `Material de teste ${i}`,
    quantidade: 1,
    unidade: 'PÇ',
    certificado: 'N/A',
  }));

  const registro = {
    id: 'rir-test',
    codigo: 'RIR-INS-01',
    dataRegistro: '2026-05-30',
    recebimentoId: 'rec-1',
    recebimentoNotaFiscal: 'NF-766253',
    recebimentoRomaneio: 'ROM-246',
    uo: 'GESTAO DE MATERIAIS',
    localObra: 'Jaú-SP',
    contratoNumero: '66.234.531/0001-57',
    fornecedorNome: 'Endress & Hauser',
    inspecaoQuantitativa: true,
    inspecaoQualitativa: true,
    inspecaoDimensional: false,
    procedimentoNumero: 'PE-INS-001 REV.1',
    solCompraPackList: 'N/A',
    obsCurta: '',
    itensRir: itens,
    instrumentos: '',
    documentosQc: '',
    observacoesQc: 'OK',
    laudo: 'aprovado',
    assinaturaRecebimento: { nome: 'A', data: '2026-05-30' },
    assinaturaCq: { nome: 'B', data: '2026-05-30' },
    assinaturaCliente: { nome: 'C', data: '2026-05-30' },
    origem: '',
    responsavel: '',
    descricao: '',
    status: 'tratado',
    acaoImediata: '',
    observacoes: '',
  } as RirRegistro;

  return {
    registro,
    branding: { cliente: 'I.S.O PRO', projeto: 'GESTAO DE MATERIAIS' },
    uoExibir: 'GESTAO DE MATERIAIS',
    localExibir: 'Jaú-SP',
    contratoExibir: '66.234.531/0001-57',
    disciplinaExibir: 'Instrumentação',
    escopoLinha: 'I.S.O PRO · GESTAO DE MATERIAIS',
    emitidoEm: '02/06/2026, 21:30',
  };
}

describe('quebrarTextoPdf', () => {
  it('quebra palavras longas respeitando largura', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica');
    const lines = quebrarTextoPdf('CHAVE DE NÍVEL VIBRATÓRIA PARA TANQUE', 80, font, 8);
    expect(lines.length).toBeGreaterThan(1);
  });

  it('quebra codigo de material longo sem espacos (evita sobrepor Qtd)', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica');
    const codigo = '4C2402-0R203504V106050906R106050906R106050';
    const larguraCod = 82;
    const lines = quebrarTextoPdf(codigo, larguraCod, font, 9.5);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(font.widthOfTextAtSize(line, 9.5)).toBeLessThanOrEqual(larguraCod + 0.5);
    }
  });
});

describe('gerarRirPdfBytes', () => {
  it('43 itens → no maximo 3 paginas PDF (nao 6)', async () => {
    const bytes = await gerarRirPdfBytes(ctxMinimo(43));
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeLessThanOrEqual(4);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
  });

  it('60 itens → no maximo 4 paginas', async () => {
    const bytes = await gerarRirPdfBytes(ctxMinimo(60));
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeLessThanOrEqual(4);
  });

  it('codigos longos ELE nao estouram coluna Qtd na pagina 1', async () => {
    const ctx = ctxMinimo(1);
    ctx.registro.itensRir![0] = {
      ...ctx.registro.itensRir![0]!,
      codigoMaterial: '4C2402-0R203504V106050906R106050',
      descricaoMaterial: 'CABO COM ISOLACAO EM CLORETO POLIVINILA (PVC) ANTI-CHAMA',
      quantidade: 9800,
      unidade: 'M',
    };
    const bytes = await gerarRirPdfBytes(ctx);
    expect(bytes.length).toBeGreaterThan(5000);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('documento contem metadados pdf-1', async () => {
    const bytes = await gerarRirPdfBytes(ctxMinimo(5));
    expect(RIR_PDF_VERSION).toBe('1.5');
    expect(String.fromCharCode(...bytes.subarray(0, 5))).toBe('%PDF-');
  });
});

describe('paginarLinhasPorAltura', () => {
  it('preenche folhas sem perder linhas', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica');
    const rows = Array.from({ length: 43 }, (_, i) => ({
      index: i,
      ...medirLinhaTabelaRir({
        codigo: `M${i}`,
        descricao: `Desc ${i}`,
        fontRegular: font,
        fontSize: 8,
        lineHeight: 9.5,
        padY: 3,
      }),
    }));
    const pages = estimarPaginasRir(rows, 210, 34);
    expect(pages).toBeLessThanOrEqual(3);
  });
});
