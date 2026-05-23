import { codigoMaterialKey } from '../../estoque/saldoFromSnapshot';
import {
  montarMetricasPorCodigoMaterial,
  type MetricasPorCodigoMaterial,
} from '../../documentos/services/documentoPlanejamento';
import { carregarMetricasPlanejamentoPorCodigo } from '../../documentos/services/documentos.service';
import { buildSaldoMap, type SaldoSnapshotPayload } from '../../estoque/saldoFromSnapshot';
import { readIsoProSnapshotPayload } from '../../../lib/isoProSnapshot';
import { hasSupabaseConfig } from '../../../lib/supabase';
import type { Material } from '../types/material.types';
import { carregarMateriaisDoCadastro } from './materiais.service';

export type MaterialEstoqueCritico = {
  materialId: string;
  codigo: string;
  descricao: string;
  unidade: string;
  saldoAtual: number;
  quantidadePlanejada: number;
  percentualAlerta: number;
  limiteAlerta: number;
  percentualSaldoVsPlanejado: number;
  severidade: 'critical' | 'warning';
};

export function calcularLimiteAlertaEstoque(quantidadePlanejada: number, percentualAlerta: number): number {
  if (!(percentualAlerta > 0 && quantidadePlanejada > 0)) return 0;
  return (quantidadePlanejada * percentualAlerta) / 100;
}

export function materialEmAlertaEstoquePlanejamento(
  saldoAtual: number,
  quantidadePlanejada: number,
  percentualAlerta: number,
): boolean {
  const limite = calcularLimiteAlertaEstoque(quantidadePlanejada, percentualAlerta);
  if (limite <= 0) return false;
  return saldoAtual <= limite;
}

export function severidadeAlertaEstoque(saldoAtual: number, limiteAlerta: number): 'critical' | 'warning' {
  if (saldoAtual <= 0) return 'critical';
  if (limiteAlerta > 0 && saldoAtual <= limiteAlerta * 0.5) return 'critical';
  return 'warning';
}

export function normalizarPercentualAlertaEstoque(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round(value * 1000) / 1000));
}

export function montarMaterialEstoqueCritico(
  material: Pick<Material, 'id' | 'codigo' | 'descricao' | 'unidade' | 'saldoAtual' | 'estoqueMinimo' | 'ativo'>,
  metricas: Map<string, MetricasPorCodigoMaterial>,
): MaterialEstoqueCritico | null {
  if (!material.ativo) return null;
  const percentualAlerta = normalizarPercentualAlertaEstoque(material.estoqueMinimo);
  if (percentualAlerta <= 0) return null;

  const quantidadePlanejada = metricas.get(codigoMaterialKey(material.codigo))?.prevista ?? 0;
  if (quantidadePlanejada <= 0) return null;

  const limiteAlerta = calcularLimiteAlertaEstoque(quantidadePlanejada, percentualAlerta);
  if (!materialEmAlertaEstoquePlanejamento(material.saldoAtual, quantidadePlanejada, percentualAlerta)) {
    return null;
  }

  const percentualSaldoVsPlanejado = Math.round((material.saldoAtual / quantidadePlanejada) * 1000) / 10;

  return {
    materialId: material.id,
    codigo: material.codigo,
    descricao: material.descricao,
    unidade: material.unidade,
    saldoAtual: material.saldoAtual,
    quantidadePlanejada,
    percentualAlerta,
    limiteAlerta,
    percentualSaldoVsPlanejado,
    severidade: severidadeAlertaEstoque(material.saldoAtual, limiteAlerta),
  };
}

async function carregarMateriaisComSaldo(): Promise<Material[]> {
  const base = await carregarMateriaisDoCadastro();
  if (!hasSupabaseConfig()) return base;
  try {
    const payload = await readIsoProSnapshotPayload<SaldoSnapshotPayload>();
    const saldoMap = buildSaldoMap(payload);
    return base.map((m) => ({
      ...m,
      saldoAtual: saldoMap.get(codigoMaterialKey(m.codigo)) ?? m.saldoAtual,
    }));
  } catch {
    return base;
  }
}

export async function listarMateriaisCriticosEstoque(): Promise<MaterialEstoqueCritico[]> {
  const [materiais, metricas] = await Promise.all([
    carregarMateriaisComSaldo(),
    carregarMetricasPlanejamentoPorCodigo(),
  ]);

  const criticos: MaterialEstoqueCritico[] = [];
  for (const material of materiais) {
    const row = montarMaterialEstoqueCritico(material, metricas);
    if (row) criticos.push(row);
  }

  return criticos.sort((a, b) => {
    if (a.severidade !== b.severidade) {
      return a.severidade === 'critical' ? -1 : 1;
    }
    return a.percentualSaldoVsPlanejado - b.percentualSaldoVsPlanejado;
  });
}

/** Util para testes ou agregacao manual. */
export function listarCriticosDeMateriais(
  materiais: Material[],
  metricas: Map<string, MetricasPorCodigoMaterial>,
): MaterialEstoqueCritico[] {
  return materiais
    .map((m) => montarMaterialEstoqueCritico(m, metricas))
    .filter((row): row is MaterialEstoqueCritico => row != null);
}

export { montarMetricasPorCodigoMaterial };
