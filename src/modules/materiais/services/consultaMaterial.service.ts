import {
  carregarSaldoMapFromAgregadosNuvem,
  fetchQuantidadeRecebidaPorCodigo,
  listDocumentosPorCodigoMaterialFromCloud,
} from '../../../lib/operacaoEscalaContagens';
import { hasSupabaseConfig } from '../../../lib/supabase';
import type { ServiceResult } from '../../../types/common.types';
import { listarHistoricoAtendimentosPagina } from '../../atendimento/services/atendimento.service';
import { codigoMaterialKey } from '../../estoque/saldoFromSnapshot';
import {
  calcularStatusMaterialPorMetricas,
  normalizeCodigoPlanejamento,
  type MetricasPorCodigoMaterial,
  type StatusPlanejamentoMaterial,
} from '../../documentos/services/documentoPlanejamento';
import type {
  ConsultaMaterialDocumentoLinha,
  ConsultaMaterialLote,
  ConsultaMaterialResult,
} from '../types/consultaMaterial.types';
import type { Material } from '../types/material.types';
import { buscarMaterialPorLeituraCodigo, carregarMateriaisDoCadastro } from './materiais.service';
import {
  calcularLimiteAlertaEstoque,
  materialEmAlertaEstoquePlanejamento,
  normalizarPercentualAlertaEstoque,
} from './materiaisEstoqueCritico.service';

const MAX_DOCUMENTOS_LINHAS = 80;
const MAX_LOTES = 20;

export const CONSULTA_STATUS_LABELS: Record<StatusPlanejamentoMaterial, string> = {
  pendente: 'Pendente',
  parcial: 'Parcial',
  recebido: 'Recebido',
  atendido: 'Atendido',
};

export function labelStatusPlanejamento(status: StatusPlanejamentoMaterial): string {
  return CONSULTA_STATUS_LABELS[status];
}

async function aplicarSaldoNoMaterial(material: Material): Promise<Material> {
  if (!hasSupabaseConfig()) return material;
  try {
    const saldoMap = await carregarSaldoMapFromAgregadosNuvem();
    if (!saldoMap) return material;
    return {
      ...material,
      saldoAtual: saldoMap.get(codigoMaterialKey(material.codigo)) ?? 0,
    };
  } catch {
    return material;
  }
}

async function resolverMaterialParaConsulta(query: string): Promise<Material | null> {
  const scan = await buscarMaterialPorLeituraCodigo(query);
  if (scan.success && scan.data) {
    return aplicarSaldoNoMaterial(scan.data);
  }

  const qLower = query.trim().toLowerCase();
  if (!qLower) return null;

  const base = await carregarMateriaisDoCadastro();
  const digits = query.replace(/\D/g, '');

  for (const m of base) {
    if (m.codigo.trim().toLowerCase() === qLower) {
      return aplicarSaldoNoMaterial(m);
    }
  }

  if (digits.length >= 8) {
    for (const m of base) {
      const b = m.codigoBarras?.replace(/\D/g, '') ?? '';
      if (b.length > 0 && b === digits) {
        return aplicarSaldoNoMaterial(m);
      }
    }
  }

  return null;
}

async function lerSaldoPorCodigo(codigoKey: string): Promise<number | null> {
  if (!hasSupabaseConfig()) return null;
  try {
    const saldoMap = await carregarSaldoMapFromAgregadosNuvem();
    if (!saldoMap || !saldoMap.has(codigoKey)) return null;
    return saldoMap.get(codigoKey) ?? 0;
  } catch {
    return null;
  }
}

function statusLinhaConsulta(
  qProj: number,
  qAtd: number,
  qRec: number,
): StatusPlanejamentoMaterial {
  if (qProj > 0 && qAtd + 1e-9 >= qProj) return 'atendido';
  if (qAtd > 1e-9) return 'parcial';
  if (qRec + 1e-9 >= qProj && qProj > 0) return 'recebido';
  if (qRec > 1e-9) return 'parcial';
  return 'pendente';
}

export async function consultarMaterialPorCodigo(raw: string): Promise<ServiceResult<ConsultaMaterialResult>> {
  const codigoConsultado = raw.trim();
  if (!codigoConsultado) {
    return { success: false, error: 'Informe o codigo do material ou leia o codigo de barras.' };
  }

  const codigoNormalizado = normalizeCodigoPlanejamento(codigoConsultado);
  if (!codigoNormalizado) {
    return { success: false, error: 'Codigo invalido.' };
  }

  // 100k-safe: tabelas + agregados — nunca catálogo completo de documentos/recebimentos.
  const [material, cloudDocs, recebidoMap, histPage] = await Promise.all([
    resolverMaterialParaConsulta(codigoConsultado),
    hasSupabaseConfig()
      ? listDocumentosPorCodigoMaterialFromCloud(codigoNormalizado, MAX_DOCUMENTOS_LINHAS)
      : Promise.resolve({
          documentos: [] as Awaited<ReturnType<typeof listDocumentosPorCodigoMaterialFromCloud>>['documentos'],
          error: undefined as string | undefined,
        }),
    hasSupabaseConfig()
      ? fetchQuantidadeRecebidaPorCodigo().catch(() => null)
      : Promise.resolve(null),
    listarHistoricoAtendimentosPagina({
      page: 1,
      pageSize: Math.min(MAX_LOTES * 3, 60),
      q: codigoNormalizado,
    }),
  ]);

  if (cloudDocs.error && cloudDocs.documentos.length === 0) {
    return { success: false, error: cloudDocs.error };
  }

  const historico = histPage.success && histPage.data ? histPage.data.items : [];

  const qRecGlobal = recebidoMap?.get(codigoNormalizado) ?? 0;
  let prevista = 0;
  let atendida = 0;
  const linhasDocumentos: ConsultaMaterialDocumentoLinha[] = [];

  for (const doc of cloudDocs.documentos) {
    for (const item of doc.itens) {
      if (normalizeCodigoPlanejamento(item.codigo) !== codigoNormalizado) continue;
      const qtd = Number(item.quantidade) || 0;
      const atd = Number(item.quantidadeAtendida) || 0;
      prevista += qtd;
      atendida += atd;
      const statusLinha = statusLinhaConsulta(qtd, atd, qRecGlobal);
      linhasDocumentos.push({
        documentoId: doc.id,
        numero: doc.numero,
        revisao: doc.revisao,
        descricao: doc.descricao,
        quantidadeProjeto: qtd,
        quantidadeAtendida: atd,
        quantidadePendente: Math.max(0, qtd - atd),
        statusLinha,
        statusLabel: labelStatusPlanejamento(statusLinha),
      });
      if (linhasDocumentos.length >= MAX_DOCUMENTOS_LINHAS) break;
    }
    if (linhasDocumentos.length >= MAX_DOCUMENTOS_LINHAS) break;
  }

  const metricaGlobal: MetricasPorCodigoMaterial | null =
    prevista > 0 || atendida > 0 || qRecGlobal > 0
      ? { prevista, recebido: qRecGlobal, atendido: atendida }
      : null;

  const saldoMaterial = material != null ? Number(material.saldoAtual) : await lerSaldoPorCodigo(codigoNormalizado);

  const lotes: ConsultaMaterialLote[] = [];
  for (const at of historico) {
    for (const item of at.itens) {
      if (normalizeCodigoPlanejamento(item.codigoMaterial) !== codigoNormalizado) continue;
      lotes.push({
        atendimentoId: at.id,
        numero: at.numero,
        dataAtendimento: at.dataAtendimento,
        documentoNumero: at.documentoNumero,
        atendente: at.atendente,
        recebedor: at.recebedor,
        quantidade: Number(item.quantidadeAtendida) || 0,
        unidade: item.unidade,
        status: at.status,
      });
      if (lotes.length >= MAX_LOTES) break;
    }
    if (lotes.length >= MAX_LOTES) break;
  }

  const statusGlobal = metricaGlobal ? calcularStatusMaterialPorMetricas(metricaGlobal) : null;
  const quantidadePlanejada = metricaGlobal?.prevista ?? 0;
  const percentualAlerta = material ? normalizarPercentualAlertaEstoque(material.estoqueMinimo) : 0;
  const limiteAlerta =
    percentualAlerta > 0 && quantidadePlanejada > 0
      ? calcularLimiteAlertaEstoque(quantidadePlanejada, percentualAlerta)
      : null;
  const saldoParaAlerta = saldoMaterial ?? 0;
  const emAlertaEstoque =
    percentualAlerta > 0 &&
    quantidadePlanejada > 0 &&
    materialEmAlertaEstoquePlanejamento(saldoParaAlerta, quantidadePlanejada, percentualAlerta);

  return {
    success: true,
    data: {
      codigoConsultado,
      codigoNormalizado,
      material,
      saldoAtual: saldoMaterial,
      statusGlobal,
      statusGlobalLabel: statusGlobal ? labelStatusPlanejamento(statusGlobal) : null,
      quantidadePlanejada,
      percentualAlerta,
      limiteAlerta,
      emAlertaEstoque,
      documentos: linhasDocumentos,
      lotes,
    },
  };
}
