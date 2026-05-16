/**
 * CSV helpers for Excel-friendly import/export (UTF-8 with BOM on export).
 */

import { yieldCooperativeAfterRowCount } from './yieldCooperativeImport';

export function stripBom(text: string): string {
  if (text.charCodeAt(0) === 0xfeff) {
    return text.slice(1);
  }
  return text;
}

export function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Escape para CSV com separador `;` (Excel em portugues). */
export function escapeCsvCellSemicolon(value: string): string {
  if (/[",;\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Formata número para células de exportação Excel (PT-BR): vírgula decimal, sem separador de milhares.
 * Não altera dados persistidos — só o texto do ficheiro CSV.
 */
export function formatDecimalExcelPtBr(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const s = value.toFixed(6);
  const trimmed = s.replace(/\.?0+$/, '') || '0';
  return trimmed.replace('.', ',');
}

function splitCsvLine(line: string, delimiter: ',' | ';'): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === delimiter && !inQuotes) {
      result.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result.map((cell) => cell.trim());
}

export function detectDelimiter(headerLine: string): ',' | ';' {
  const semis = headerLine.split(';').length - 1;
  const commas = headerLine.split(',').length - 1;
  return semis > commas ? ';' : ',';
}

function normalizeHeaderKey(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

export type CsvRecords = {
  delimiter: ',' | ';';
  headers: string[];
  rows: Record<string, string>[];
};

/**
 * Separa o ficheiro em linhas logicas de CSV. Quebras de linha **dentro** de campos entre aspas
 * (comum no Excel com texto longo / Alt+Enter) nao contam como fim de linha.
 */
function splitCsvLogicalRows(text: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '""';
        i++;
      } else {
        inQuotes = !inQuotes;
        cur += '"';
      }
    } else if (c === '\n' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

/**
 * Parses CSV text into header keys (normalized) and row objects.
 * Expects a header row; empty lines are skipped.
 */
export function parseCsvToRecords(text: string): CsvRecords | null {
  const raw = stripBom(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = splitCsvLogicalRows(raw).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return null;
  }

  const delimiter = detectDelimiter(lines[0]);
  const headerCells = splitCsvLine(lines[0], delimiter);
  const headers = headerCells.map((cell, index) => {
    const key = normalizeHeaderKey(cell);
    return key || `col_${index}`;
  });

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delimiter);
    if (cells.every((c) => c === '')) {
      continue;
    }
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cells[j] ?? '';
    }
    rows.push(row);
  }

  return { delimiter, headers, rows };
}

/**
 * So a primeira linha (cabecalhos normalizados). Evita percorrer o ficheiro inteiro
 * para validacoes leves (ex.: deteccao do modelo de importacao).
 */
export function parseCsvHeadersOnly(text: string): string[] | null {
  const raw = stripBom(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = splitCsvLogicalRows(raw).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return null;
  }
  const delimiter = detectDelimiter(lines[0]);
  const headerCells = splitCsvLine(lines[0], delimiter);
  return headerCells.map((cell, index) => {
    const key = normalizeHeaderKey(cell);
    return key || `col_${index}`;
  });
}

/**
 * Igual a {@link parseCsvToRecords}, mas cede o event loop a cada N linhas de dados
 * para ficheiros grandes nao bloquearem a janela durante o parse.
 */
export async function parseCsvToRecordsCooperative(text: string): Promise<CsvRecords | null> {
  const raw = stripBom(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = splitCsvLogicalRows(raw).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return null;
  }

  const delimiter = detectDelimiter(lines[0]);
  const headerCells = splitCsvLine(lines[0], delimiter);
  const headers = headerCells.map((cell, index) => {
    const key = normalizeHeaderKey(cell);
    return key || `col_${index}`;
  });

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delimiter);
    if (cells.every((c) => c === '')) {
      continue;
    }
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cells[j] ?? '';
    }
    rows.push(row);
    await yieldCooperativeAfterRowCount(rows.length);
  }

  return { delimiter, headers, rows };
}
