import { describe, expect, it } from 'vitest';
import type { MaterialEstoqueCritico } from './materiaisEstoqueCritico.service';
import {
  deveEnviarAlertaEstoqueEmail,
  montarAssuntoAlertaEstoqueCritico,
  montarCorpoTextoAlertaEstoqueCritico,
} from './alertaEstoqueEmail.service';

function critico(id: string, severidade: 'critical' | 'warning' = 'critical'): MaterialEstoqueCritico {
  return {
    materialId: id,
    codigo: id,
    descricao: 'Material teste',
    unidade: 'UN',
    saldoAtual: 0,
    quantidadePlanejada: 100,
    percentualAlerta: 20,
    limiteAlerta: 20,
    percentualSaldoVsPlanejado: 0,
    severidade,
  };
}

describe('alertaEstoqueEmail.service', () => {
  it('nao envia quando lista de criticos nao mudou', () => {
    expect(
      deveEnviarAlertaEstoqueEmail([critico('a'), critico('b')], {
        lastNotifiedCriticalIds: ['a', 'b'],
        lastSentAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toBe(false);
  });

  it('envia quando aparece critico novo', () => {
    expect(
      deveEnviarAlertaEstoqueEmail([critico('a'), critico('c')], {
        lastNotifiedCriticalIds: ['a', 'b'],
        lastSentAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('nao envia quando so ha itens em atencao', () => {
    expect(
      deveEnviarAlertaEstoqueEmail([critico('a', 'warning')], {
        lastNotifiedCriticalIds: [],
        lastSentAt: '',
      }),
    ).toBe(false);
  });

  it('monta assunto e corpo com contexto da obra', () => {
    expect(montarAssuntoAlertaEstoqueCritico(2, 'Obra 55')).toContain('2 material(is) critico(s)');
    expect(montarAssuntoAlertaEstoqueCritico(2, 'Obra 55')).toContain('Obra 55');
    const texto = montarCorpoTextoAlertaEstoqueCritico([critico('TB-1')], {
      cliente: 'Cliente X',
      projeto: 'Obra 55',
    });
    expect(texto).toContain('TB-1');
    expect(texto).toContain('Cliente X');
    expect(texto).toContain('Obra 55');
  });
});
