import { describe, expect, it } from 'vitest';
import {
  escapeCsvCellSemicolon,
  formatDecimalExcelPtBr,
  parseCsvToRecords,
  parseCsvToRecordsCooperative,
} from './csv';

describe('parseCsvToRecords', () => {
  it('parses comma-delimited CSV with header and one row', () => {
    const text = 'codigo,descricao,disciplina\nA1,Descricao teste,Tubulacao';
    const r = parseCsvToRecords(text);
    expect(r).not.toBeNull();
    expect(r?.rows).toHaveLength(1);
    expect(r?.rows[0].codigo).toBe('A1');
    expect(r?.rows[0].descricao).toBe('Descricao teste');
  });

  it('detects semicolon delimiter', () => {
    const text = 'codigo;descricao;peso\nX;Item;12,5';
    const r = parseCsvToRecords(text);
    expect(r?.delimiter).toBe(';');
    expect(r?.rows[0].codigo).toBe('X');
    expect(r?.rows[0].peso).toBe('12,5');
  });

  it('returns null when only header line', () => {
    expect(parseCsvToRecords('codigo,descricao')).toBeNull();
  });

  it('strips BOM', () => {
    const text = '\uFEFFcodigo,descricao\nA,B';
    const r = parseCsvToRecords(text);
    expect(r?.rows[0].codigo).toBe('A');
  });

  it('keeps one data row when quoted field contains newline (Excel/Alt+Enter)', () => {
    const text = 'codigo;descricao;disciplina\nBOB;"CABO PARA\nSINAL";Eletrica';
    const r = parseCsvToRecords(text);
    expect(r).not.toBeNull();
    expect(r?.rows).toHaveLength(1);
    expect(r?.rows[0].codigo).toBe('BOB');
    expect(r?.rows[0].descricao).toBe('CABO PARA\nSINAL');
    expect(r?.rows[0].disciplina).toBe('Eletrica');
  });
});

describe('parseCsvToRecordsCooperative', () => {
  it('produz o mesmo resultado que parseCsvToRecords para ficheiro pequeno', async () => {
    const text = 'codigo;descricao;peso\nX;Item;12,5\nY;Outro;1';
    const sync = parseCsvToRecords(text);
    const coop = await parseCsvToRecordsCooperative(text);
    expect(coop).toEqual(sync);
  });
});

describe('escapeCsvCellSemicolon', () => {
  it('quotes values that contain semicolon', () => {
    expect(escapeCsvCellSemicolon('a;b')).toBe('"a;b"');
  });
});

describe('formatDecimalExcelPtBr', () => {
  it('usa virgula decimal e corta zeros a direita', () => {
    expect(formatDecimalExcelPtBr(330.4)).toBe('330,4');
    expect(formatDecimalExcelPtBr(2.5)).toBe('2,5');
    expect(formatDecimalExcelPtBr(7)).toBe('7');
    expect(formatDecimalExcelPtBr(0)).toBe('0');
  });
});
