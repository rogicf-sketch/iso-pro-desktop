/**
 * Importacao Excel (CSV): uma linha por colaborador. Separador ; ou , (detectado pelo cabecalho).
 */

import { escapeCsvCellSemicolon, parseCsvToRecords } from '../../../lib/csv';
import type { ColaboradorFormData } from '../types/colaborador.types';

function cell(row: Record<string, string>, ...aliases: string[]): string {
  for (const key of aliases) {
    if (row[key] !== undefined && String(row[key]).trim() !== '') {
      return String(row[key]);
    }
  }
  return '';
}

function parseTipo(raw: string): 'interno' | 'externo' {
  const t = raw.trim().toLowerCase();
  if (t === 'externo' || t === 'e' || t === 'ext') return 'externo';
  return 'interno';
}

function parseAtivo(raw: string, defaultAtivo: boolean): boolean {
  const t = raw.trim().toLowerCase();
  if (!t) return defaultAtivo;
  if (['sim', 's', '1', 'true', 'ativo', 'yes', 'verdadeiro'].includes(t)) return true;
  if (['nao', 'n', '0', 'false', 'inativo', 'no', 'falso'].includes(t)) return false;
  return defaultAtivo;
}

/** Monta formulario a partir de uma linha CSV (chaves normalizadas pelo parseCsvToRecords). */
export type ResultadoImportacaoColaboradoresCsv = {
  criados: number;
  atualizados: number;
  ignorados: number;
  ignoradosPorDuplicidadeNoArquivo: number;
  detalhes: string[];
};

export function colaboradorRowToFormData(row: Record<string, string>): ColaboradorFormData {
  const tipo = parseTipo(cell(row, 'tipo', 'tipo_colaborador'));
  let empresa = cell(row, 'empresa', 'company').trim();
  if (!empresa && tipo === 'interno') {
    empresa = 'ISO PRO';
  }
  return {
    nome: cell(row, 'nome', 'colaborador', 'name').trim(),
    tipo,
    matricula: cell(row, 'matricula', 'matricula_interna').trim(),
    funcao: cell(row, 'funcao', 'cargo').trim(),
    empresa,
    documento: cell(row, 'documento', 'cpf', 'rg', 'cnpj').trim(),
    telefone: cell(row, 'telefone', 'tel', 'fone').trim(),
    observacao: cell(row, 'observacao', 'obs', 'observacoes').trim(),
    ativo: parseAtivo(cell(row, 'ativo', 'status'), true),
  };
}

export function previewImportacaoColaboradoresCsv(text: string): { ok: true; linhaCount: number } | { ok: false; error: string } {
  const parsed = parseCsvToRecords(text);
  if (!parsed || parsed.rows.length === 0) {
    return { ok: false, error: 'CSV invalido ou sem linhas de dados (cabecalho obrigatorio).' };
  }
  return { ok: true, linhaCount: parsed.rows.length };
}

export function montarModeloCsvImportacaoColaboradores(): { csv: string; fileName: string } {
  const header = [
    'nome',
    'tipo',
    'matricula',
    'funcao',
    'empresa',
    'documento',
    'telefone',
    'observacao',
    'ativo',
  ];
  const exemplo = [
    'Maria Exemplo',
    'interno',
    '99999',
    'Conferente',
    'ISO PRO',
    '',
    '(11) 90000-0000',
    '',
    'sim',
  ];
  const linhas = [header, exemplo].map((cells) => cells.map(escapeCsvCellSemicolon).join(';')).join('\r\n');
  const csv = `\uFEFF${linhas}\r\n`;
  return { csv, fileName: 'iso-pro-colaboradores-modelo-importacao.csv' };
}
