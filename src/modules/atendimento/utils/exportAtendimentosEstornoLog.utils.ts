import { escapeCsvCellSemicolon, formatDecimalExcelPtBr } from '../../../lib/csv';
import type { AtendimentoItem, EstornoLogRegistro } from '../types/atendimento.types';

export const CSV_EXCEL_SEP_ATD = ';';

/** Quantidade da retirada original; legado usa saldo atual quando nunca houve estorno. */
export function quantidadeRetiradaOriginalItem(item: AtendimentoItem): number {
  const original = Number(item.quantidadeRetiradaOriginal);
  if (Number.isFinite(original) && original > 0) return original;
  return Number(item.quantidadeAtendida) || 0;
}

export function quantidadeEstornadaAcumuladaItem(item: AtendimentoItem): number {
  const original = quantidadeRetiradaOriginalItem(item);
  const atual = Number(item.quantidadeAtendida) || 0;
  return Math.max(0, original - atual);
}

export function montarCsvEstornoLog(registros: EstornoLogRegistro[]): string {
  const header = [
    'data_estorno',
    'lote_numero',
    'lote_id',
    'atendimento_item_id',
    'documento_numero',
    'codigo_material',
    'descricao_material',
    'unidade',
    'quantidade_estornada',
    'quantidade_retirada_original',
    'quantidade_restante_no_lote',
    'quem_estornou',
    'quem_devolveu',
    'motivo_estorno',
    'estorno_parcial_lote',
  ];

  const linhas = [header.join(CSV_EXCEL_SEP_ATD)];
  const sorted = [...registros].sort((a, b) => b.dataEstorno.localeCompare(a.dataEstorno));

  for (const r of sorted) {
    linhas.push(
      [
        r.dataEstorno,
        r.loteNumero,
        r.loteId,
        r.atendimentoItemId,
        r.documentoNumero,
        r.codigoMaterial,
        r.descricaoMaterial,
        r.unidade,
        formatDecimalExcelPtBr(r.quantidadeEstornada),
        formatDecimalExcelPtBr(r.quantidadeRetiradaOriginal),
        formatDecimalExcelPtBr(r.quantidadeRestanteNoLote),
        r.nomeQuemEstorna,
        r.nomeQuemDevolve,
        r.motivoEstorno,
        r.estornoParcialLote ? 'sim' : 'nao',
      ]
        .map((c) => escapeCsvCellSemicolon(String(c)))
        .join(CSV_EXCEL_SEP_ATD),
    );
  }

  return `\uFEFF${linhas.join('\r\n')}\r\n`;
}

export function nomeArquivoExportAtendimentos(stamp: string): string {
  return `iso-pro-atendimentos-materiais-${stamp}.csv`;
}

export function nomeArquivoExportEstornoLog(stamp: string): string {
  return `iso-pro-estornos-log-${stamp}.csv`;
}

export function nomeArquivoExportAtendimentosZip(stamp: string): string {
  return `iso-pro-atendimentos-export-${stamp}.zip`;
}
