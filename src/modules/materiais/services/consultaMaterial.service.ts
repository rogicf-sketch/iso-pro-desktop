import { buildSaldoMap, codigoMaterialKey, type SaldoSnapshotPayload } from '../../estoque/saldoFromSnapshot';
import { readIsoProSnapshotPayload } from '../../../lib/isoProSnapshot';
import { hasSupabaseConfig } from '../../../lib/supabase';
import type { ServiceResult } from '../../../types/common.types';
import { listarHistoricoAtendimentos } from '../../atendimento/services/atendimento.service';
import { carregarTodosDocumentosOrdenados } from '../../documentos/services/documentos.service';
import {
  calcularStatusMaterialPorMetricas,
  montarMetricasPorCodigoMaterial,
  normalizeCodigoPlanejamento,
  resolverStatusLinhaDocumento,
  type StatusPlanejamentoMaterial,
} from '../../documentos/services/documentoPlanejamento';
import { carregarRecebimentosCompletos } from '../../recebimentos/services/recebimentos.service';
import type {
  ConsultaMaterialDocumentoLinha,
  ConsultaMaterialLote,
  ConsultaMaterialResult,
} from '../types/consultaMaterial.types';
import type { Material } from '../types/material.types';
import { buscarMaterialPorLeituraCodigo, carregarMateriaisDoCadastro } from './materiais.service';

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
    const payload = await readIsoProSnapshotPayload<SaldoSnapshotPayload>();
    const saldoMap = buildSaldoMap(payload);
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
    const payload = await readIsoProSnapshotPayload<SaldoSnapshotPayload>();
    const saldoMap = buildSaldoMap(payload);
    if (!saldoMap.has(codigoKey)) return null;
    return saldoMap.get(codigoKey) ?? 0;
  } catch {
    return null;
  }
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

  const [material, docsResult, recebimentos, historico] = await Promise.all([
    resolverMaterialParaConsulta(codigoConsultado),
    carregarTodosDocumentosOrdenados(),
    carregarRecebimentosCompletos(),
    listarHistoricoAtendimentos(),
  ]);

  if (!docsResult.success) {
    return { success: false, error: docsResult.error ?? 'Falha ao carregar planejamento.' };
  }

  const documentos = docsResult.data ?? [];
  const metricas = montarMetricasPorCodigoMaterial(documentos, recebimentos);
  const metricaGlobal = metricas.get(codigoNormalizado) ?? null;

  const saldoMaterial = material != null ? Number(material.saldoAtual) : await lerSaldoPorCodigo(codigoNormalizado);

  const linhasDocumentos: ConsultaMaterialDocumentoLinha[] = [];
  for (const doc of documentos) {
    if (doc.status === 'cancelado') continue;
    for (const item of doc.itens) {
      if (normalizeCodigoPlanejamento(item.codigoMaterial) !== codigoNormalizado) continue;
      const qtd = Number(item.quantidadeProjeto) || 0;
      const atd = Number(item.quantidadeAtendida) || 0;
      const pendente = Math.max(0, qtd - atd);
      const statusLinha = resolverStatusLinhaDocumento(item, metricas);
      linhasDocumentos.push({
        documentoId: doc.id,
        numero: doc.numero,
        revisao: doc.revisao,
        descricao: doc.descricao,
        quantidadeProjeto: qtd,
        quantidadeAtendida: atd,
        quantidadePendente: pendente,
        statusLinha,
        statusLabel: labelStatusPlanejamento(statusLinha),
      });
      if (linhasDocumentos.length >= MAX_DOCUMENTOS_LINHAS) break;
    }
    if (linhasDocumentos.length >= MAX_DOCUMENTOS_LINHAS) break;
  }

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

  return {
    success: true,
    data: {
      codigoConsultado,
      codigoNormalizado,
      material,
      saldoAtual: saldoMaterial,
      statusGlobal,
      statusGlobalLabel: statusGlobal ? labelStatusPlanejamento(statusGlobal) : null,
      documentos: linhasDocumentos,
      lotes,
    },
  };
}
