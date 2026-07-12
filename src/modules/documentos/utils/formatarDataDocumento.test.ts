import { describe, expect, it } from 'vitest';
import { formatarDataDocumentoPtBr } from './formatarDataDocumento';

describe('formatarDataDocumentoPtBr', () => {
  it('converte YYYY-MM-DD para dd/mm/aaaa', () => {
    expect(formatarDataDocumentoPtBr('2026-05-30')).toBe('30/05/2026');
  });

  it('mantém data já em pt-BR', () => {
    expect(formatarDataDocumentoPtBr('30/05/2026')).toBe('30/05/2026');
  });

  it('retorna traço para vazio', () => {
    expect(formatarDataDocumentoPtBr('')).toBe('—');
    expect(formatarDataDocumentoPtBr(null)).toBe('—');
  });
});
