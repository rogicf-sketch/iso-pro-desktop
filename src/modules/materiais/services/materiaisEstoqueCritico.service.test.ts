import { describe, expect, it } from 'vitest';
import {
  calcularLimiteAlertaEstoque,
  materialEmAlertaEstoquePlanejamento,
  montarMaterialEstoqueCritico,
  severidadeAlertaEstoque,
} from './materiaisEstoqueCritico.service';

describe('materiaisEstoqueCritico.service', () => {
  it('calcula limite como percentual do planejado', () => {
    expect(calcularLimiteAlertaEstoque(1000, 20)).toBe(200);
    expect(calcularLimiteAlertaEstoque(0, 20)).toBe(0);
  });

  it('dispara alerta quando saldo <= limite', () => {
    expect(materialEmAlertaEstoquePlanejamento(200, 1000, 20)).toBe(true);
    expect(materialEmAlertaEstoquePlanejamento(201, 1000, 20)).toBe(false);
    expect(materialEmAlertaEstoquePlanejamento(50, 1000, 0)).toBe(false);
  });

  it('monta linha critica com metricas de planejamento', () => {
    const metricas = new Map([
      ['abc', { prevista: 500, recebido: 400, atendido: 100 }],
    ]);
    const row = montarMaterialEstoqueCritico(
      {
        id: '1',
        codigo: 'ABC',
        descricao: 'Teste',
        unidade: 'UN',
        saldoAtual: 50,
        estoqueMinimo: 20,
        ativo: true,
      },
      metricas,
    );
    expect(row?.limiteAlerta).toBe(100);
    expect(row?.severidade).toBe('critical');
  });

  it('severidade critica quando saldo zero', () => {
    expect(severidadeAlertaEstoque(0, 100)).toBe('critical');
    expect(severidadeAlertaEstoque(40, 100)).toBe('critical');
    expect(severidadeAlertaEstoque(80, 100)).toBe('warning');
  });
});
