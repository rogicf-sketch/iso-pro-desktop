import { describe, expect, it } from 'vitest';
import { formatQtdOperacaoDisplay, situacaoSaldoAtendimento } from './AtendimentoItensTable';

describe('situacaoSaldoAtendimento', () => {
  it('saldo 0 → Sem saldo', () => {
    expect(situacaoSaldoAtendimento(0, 93)).toEqual({ text: 'Sem saldo', tone: 'danger' });
  });

  it('saldo parcial entre 0 e pendente', () => {
    expect(situacaoSaldoAtendimento(5, 93)).toEqual({ text: 'Saldo parcial', tone: 'warning' });
  });

  it('saldo cobre o pendente → Pode atender', () => {
    expect(situacaoSaldoAtendimento(93, 93)).toEqual({ text: 'Pode atender', tone: 'ok' });
  });
});

describe('formatQtdOperacaoDisplay', () => {
  it('zero fica vazio para digitar mais rapido', () => {
    expect(formatQtdOperacaoDisplay(0)).toBe('');
  });

  it('inteiro sem lixo decimal', () => {
    expect(formatQtdOperacaoDisplay(20)).toBe('20');
  });

  it('decimal com virgula BR e sem zeros a direita', () => {
    expect(formatQtdOperacaoDisplay(0.72)).toBe('0,72');
    expect(formatQtdOperacaoDisplay(3.593)).toBe('3,593');
  });

  it('nao mostra lixo de ponto flutuante', () => {
    expect(formatQtdOperacaoDisplay(19.997000000000001)).toBe('19,997');
  });
});
