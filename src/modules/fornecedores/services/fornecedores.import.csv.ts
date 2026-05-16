/**
 * Importacao Excel (CSV): uma linha por fornecedor. Separador `;` (parseCsvToRecords).
 */

import { escapeCsvCellSemicolon, parseCsvToRecords } from '../../../lib/csv';
import { mensagemSeCabecalhoImportCsvIncompativel } from '../../../lib/csvImportHeaderGuard';
import type { FornecedorFormData } from '../types/fornecedor.types';

function cell(row: Record<string, string>, ...aliases: string[]): string {
  for (const key of aliases) {
    if (row[key] !== undefined && String(row[key]).trim() !== '') {
      return String(row[key]);
    }
  }
  return '';
}

function parseAtivo(raw: string, defaultAtivo: boolean): boolean {
  const t = raw.trim().toLowerCase();
  if (!t) return defaultAtivo;
  if (['sim', 's', '1', 'true', 'ativo', 'yes', 'verdadeiro'].includes(t)) return true;
  if (['nao', 'n', '0', 'false', 'inativo', 'no', 'falso'].includes(t)) return false;
  return defaultAtivo;
}

export type ResultadoImportacaoFornecedoresCsv = {
  criados: number;
  atualizados: number;
  ignorados: number;
  ignoradosPorDuplicidadeNoArquivo: number;
  detalhes: string[];
};

export function fornecedorRowToFormData(row: Record<string, string>): FornecedorFormData {
  return {
    nome: cell(row, 'nome', 'fornecedor', 'razao_social').trim(),
    cnpj: cell(row, 'cnpj', 'documento').trim(),
    telefone: cell(row, 'telefone', 'tel', 'fone').trim(),
    email: cell(row, 'email', 'e_mail').trim(),
    endereco: cell(row, 'endereco', 'endereco_completo', 'logradouro').trim(),
    ativo: parseAtivo(cell(row, 'ativo', 'status'), true),
  };
}

export function previewImportacaoFornecedoresCsv(text: string): { ok: true; linhaCount: number } | { ok: false; error: string } {
  const cabErr = mensagemSeCabecalhoImportCsvIncompativel('fornecedores', text);
  if (cabErr) {
    return { ok: false, error: cabErr };
  }
  const parsed = parseCsvToRecords(text);
  if (!parsed || parsed.rows.length === 0) {
    return { ok: false, error: 'CSV invalido ou sem linhas de dados (cabecalho obrigatorio).' };
  }
  return { ok: true, linhaCount: parsed.rows.length };
}

export function montarModeloCsvImportacaoFornecedores(): { csv: string; fileName: string } {
  const header = ['nome', 'cnpj', 'telefone', 'email', 'endereco', 'ativo'];
  const rows = [
    ['Fornecedor Exemplo Ltda', '12.345.678/0001-90', '(11) 3456-7890', 'contato@exemplo.com', 'Av. Paulista, 1000', 'sim'],
    ['Outro Fornecedor LTDA', '98.765.432/0001-10', '', '', 'Rua das Flores, 200', 'sim'],
  ];
  const sep = ';';
  const lines = [
    header.join(sep),
    ...rows.map((r) => r.map((c) => escapeCsvCellSemicolon(c)).join(sep)),
  ];
  const csv = `\uFEFF${lines.join('\r\n')}\r\n`;
  return { csv, fileName: 'iso-pro-fornecedores-modelo-importacao.csv' };
}
