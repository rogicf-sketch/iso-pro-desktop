import { describe, expect, it } from 'vitest';
import { coerceRecebimentoQuantidade, parseDecimalFlexible, roundPesoKg } from './parseDecimal';

describe('parseDecimalFlexible', () => {
  it('aceita ponto como decimal', () => {
    expect(parseDecimalFlexible('12.5')).toBe(12.5);
    expect(parseDecimalFlexible('0.35')).toBe(0.35);
  });

  it('aceita virgula como decimal quando nao ha ponto', () => {
    expect(parseDecimalFlexible('12,5')).toBe(12.5);
    expect(parseDecimalFlexible('0,35')).toBe(0.35);
    expect(parseDecimalFlexible('749,5')).toBe(749.5);
  });

  it('formato BR: milhar com ponto e decimal com virgula', () => {
    expect(parseDecimalFlexible('1.234,56')).toBe(1234.56);
    expect(parseDecimalFlexible('7.495,5')).toBe(7495.5);
    expect(parseDecimalFlexible('10.500,25')).toBe(10500.25);
  });

  it('formato BR: milhar so com pontos (sem virgula)', () => {
    expect(parseDecimalFlexible('7.495')).toBe(7495);
    expect(parseDecimalFlexible('1.234.567')).toBe(1234567);
  });

  it('nao confunde zero inicial ou decimais curtos', () => {
    expect(parseDecimalFlexible('0.125')).toBe(0.125);
    expect(parseDecimalFlexible('12.34')).toBe(12.34);
    expect(parseDecimalFlexible('749.5')).toBe(749.5);
    expect(parseDecimalFlexible('3.14159')).toBe(3.14159);
  });

  it('string vazia vira zero', () => {
    expect(parseDecimalFlexible('')).toBe(0);
    expect(parseDecimalFlexible('   ')).toBe(0);
  });
});

describe('roundPesoKg', () => {
  it('arredonda a duas casas como planilha em pt-BR', () => {
    expect(roundPesoKg(6.2 * 2.39)).toBe(14.82);
    expect(roundPesoKg(1.8 * 2.39)).toBe(4.3);
  });
});

describe('coerceRecebimentoQuantidade', () => {
  it('parseia strings BR como parseDecimalFlexible', () => {
    expect(coerceRecebimentoQuantidade('749,5')).toBe(749.5);
    expect(coerceRecebimentoQuantidade('7.495,5')).toBe(7495.5);
  });

  it('arredonda numeros a 6 casas', () => {
    expect(coerceRecebimentoQuantidade(35.999999999999964)).toBe(36);
  });

  it('null e undefined viram zero', () => {
    expect(coerceRecebimentoQuantidade(null)).toBe(0);
    expect(coerceRecebimentoQuantidade(undefined)).toBe(0);
  });
});
