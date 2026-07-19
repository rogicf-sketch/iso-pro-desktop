import { describe, expect, it } from 'vitest';
import {
  calcularLimiteAlertaEstoque,
  materialEmAlertaEstoquePlanejamento,
  montarMaterialEstoqueCritico,
  montarExportacaoMateriaisCriticosCsv,
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

  it('exporta o alerta geral em CSV compativel com Excel', () => {
    const result = montarExportacaoMateriaisCriticosCsv(
      [
        {
          materialId: '1',
          codigo: 'ABC',
          descricao: 'Válvula; teste',
          unidade: 'PC',
          saldoAtual: 1.5,
          quantidadePlanejada: 10,
          percentualAlerta: 20,
          limiteAlerta: 2,
          percentualSaldoVsPlanejado: 15,
          severidade: 'critical',
        },
      ],
      new Date('2026-07-19T12:00:00.000Z'),
    );

    expect(result.fileName).toBe('materiais-estoque-critico-2026-07-19.csv');
    expect(result.csv.startsWith('\uFEFFCódigo;Descrição;Unidade;')).toBe(true);
    expect(result.csv).toContain('ABC;"Válvula; teste";PC;"1,5";10;2;20;15;Crítico');
  });
});
