/**
 * Gera PDFs de amostra do layout RIR v1.3 (ins-pag-3) para revisão visual.
 * Uso: npx tsx scripts/gerar-rir-preview.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RirRegistro } from '../src/modules/qualidade/types/qualidade.types';
import { gerarRirPdfBytes } from '../src/modules/qualidade/pdf/rirPdfDocument';
import type { RirPdfContexto } from '../src/modules/qualidade/pdf/rirPdfDocument';
import { definirFontesRirPdfExternas, validarBytesFontePdf } from '../src/modules/qualidade/pdf/rirPdfFonts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fontsDir = join(root, 'public', 'fonts');
const outDir = join(root, 'samples', 'rir-layout-v1.3');

function lerFonte(nomes: string[]): Uint8Array {
  for (const nome of nomes) {
    try {
      const bytes = new Uint8Array(readFileSync(join(fontsDir, nome)));
      if (validarBytesFontePdf(bytes)) return bytes;
    } catch {
      /* próximo */
    }
  }
  throw new Error(`Fonte não encontrada em ${fontsDir}. Execute: npm run sync:rir-fonts`);
}

definirFontesRirPdfExternas({
  regular: lerFonte(['noto-sans-regular.ttf', 'noto-sans-regular.woff']),
  bold: lerFonte(['noto-sans-bold.ttf', 'noto-sans-bold.woff']),
  familia: 'Noto Sans',
});

function baseRegistro(partial: Partial<RirRegistro> & Pick<RirRegistro, 'codigo' | 'itensRir'>): RirRegistro {
  return {
    id: 'rir-preview',
    dataRegistro: '2026-05-30',
    recebimentoId: 'rec-preview',
    recebimentoNotaFiscal: partial.recebimentoNotaFiscal ?? 'NF-766253',
    recebimentoRomaneio: partial.recebimentoRomaneio ?? 'ROM-246',
    uo: 'GESTAO DE MATERIAIS',
    localObra: 'Jaú-SP',
    contratoNumero: '66.234.531/0001-57',
    fornecedorNome: partial.fornecedorNome ?? 'Endress & Hauser',
    inspecaoQuantitativa: true,
    inspecaoQualitativa: true,
    inspecaoDimensional: false,
    procedimentoNumero: partial.procedimentoNumero ?? 'PE-INS-001 REV.1',
    solCompraPackList: 'N/A',
    obsCurta: '',
    instrumentos: '',
    documentosQc: '',
    observacoesQc: 'Inspeção conforme procedimento. Sem não conformidades.',
    laudo: 'aprovado',
    assinaturaRecebimento: { nome: 'João Silva', data: '2026-05-30' },
    assinaturaCq: { nome: 'Maria QC', data: '2026-05-30' },
    assinaturaCliente: { nome: 'Cliente Rep.', data: '2026-05-30' },
    origem: '',
    responsavel: '',
    descricao: '',
    status: 'tratado',
    acaoImediata: '',
    observacoes: '',
    ...partial,
  } as RirRegistro;
}

function ctxFrom(registro: RirRegistro, disciplina: string, escopo: string): RirPdfContexto {
  return {
    registro,
    branding: { cliente: 'I.S.O PRO', projeto: 'GESTAO DE MATERIAIS' },
    uoExibir: 'GESTAO DE MATERIAIS',
    localExibir: 'Jaú-SP',
    contratoExibir: '66.234.531/0001-57',
    disciplinaExibir: disciplina,
    escopoLinha: escopo,
    emitidoEm: new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
  };
}

async function main() {
  mkdirSync(outDir, { recursive: true });

  const insItens = Array.from({ length: 43 }, (_, i) => ({
    id: `ins-${i}`,
    codigoMaterial: `SE-SE2-BB-BBH04-AIT${156 + i}`,
    descricaoMaterial: i % 3 === 0 ? 'ANALISADOR DE pH' : i % 3 === 1 ? 'TRANSMISSOR DE VAZÃO MAGNÉTICO' : 'SENSOR DE TEMPERATURA',
    quantidade: 1,
    unidade: 'PÇ',
    certificado: 'N/A',
  }));

  const insBytes = await gerarRirPdfBytes(
    ctxFrom(
      baseRegistro({ codigo: 'RIR-INS-01', itensRir: insItens }),
      'Instrumentação',
      'I.S.O PRO · GESTAO DE MATERIAIS',
    ),
  );
  writeFileSync(join(outDir, 'RIR-INS-01-43itens-preview.pdf'), insBytes);

  const eleDesc =
    'FIO/CABO COM ISOLAÇÃO EM CLORETO DE POLIVINILA (PVC) ANTI-CHAMA, BITOLA 4 MM², COR VERMELHA, NORMA ABNT NBR 7286';
  const eleItens = Array.from({ length: 12 }, (_, i) => ({
    id: `ele-${i}`,
    codigoMaterial: `4C2402-0R203504V106050906R${100 + i}`,
    descricaoMaterial: eleDesc,
    quantidade: 500 + i * 100,
    unidade: 'M',
    certificado: 'N/A',
  }));

  const eleBytes = await gerarRirPdfBytes(
    ctxFrom(
      baseRegistro({
        codigo: 'RIR-ELE-01',
        recebimentoNotaFiscal: '163619',
        recebimentoRomaneio: 'ROM-B10060',
        fornecedorNome: 'Cordeiro Cabos Elétricos S.A.',
        procedimentoNumero: 'PE-ELE-001 REV.1',
        itensRir: eleItens,
      }),
      'Elétrica',
      'I.S.O PRO · GESTAO DE MATERIAIS',
    ),
  );
  writeFileSync(join(outDir, 'RIR-ELE-01-cabos-preview.pdf'), eleBytes);

  const tubItens = Array.from({ length: 10 }, (_, i) => ({
    id: `tub-${i}`,
    codigoMaterial: i === 0 ? 'TUBC1B0400BB00-8035350' : `567${6 + i}-E.RAZN008D-TUA-10017_A`,
    descricaoMaterial:
      i === 0
        ? 'TUBO AI A312/TP304L E=0.85 SCH 5S - B36.19 BI . 10"'
        : `TUBO AC ASTM A53 Gr. B, SC GALVANIZADO, ASME B36.10 PR SCH 40 ${3 + i}"`,
    quantidade: [312, 16, 1, 3, 78, 486, 306, 6, 6, 12][i] ?? 1,
    unidade: i < 4 ? (i === 0 ? 'M' : 'PC') : i < 7 ? 'M' : 'PÇ',
    certificado: 'CERT-2026-467',
  }));

  const tubBytes = await gerarRirPdfBytes(
    ctxFrom(
      baseRegistro({
        codigo: 'RIR-TUB-02',
        recebimentoNotaFiscal: 'NF-9971122',
        recebimentoRomaneio: 'ROM-2026-018',
        fornecedorNome: 'Marcegaglia do Brasil Ltda',
        procedimentoNumero: 'PE-TUB-003 REV.2',
        itensRir: tubItens,
      }),
      'Tubulação',
      'RAÍZEN · Projeto Raízen Biogás · GESTAO DE MATERIAIS',
    ),
  );
  writeFileSync(join(outDir, 'RIR-TUB-02-preview-v1.3.pdf'), tubBytes);

  console.log('PDFs gerados em:', outDir);
  console.log('  - RIR-INS-01-43itens-preview.pdf');
  console.log('  - RIR-ELE-01-cabos-preview.pdf');
  console.log('  - RIR-TUB-02-preview-v1.3.pdf');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
