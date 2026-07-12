import { readIsoProSnapshotSlices } from '../../../lib/isoProSnapshot';
import { getSupabase, hasSupabaseConfig } from '../../../lib/supabase';
import type { AtendimentoIntegridadeRelatorio } from '../types/atendimentoIntegridadeAudit.types';
import {
  auditarIntegridadeAtendimentoSnapshot,
  relatorioIntegridadeParaCsv,
} from '../utils/atendimentoIntegridadeAudit.utils';

const AUDIT_SLICE_KEYS = ['documentos', 'atendimentos', 'atendimentoHistorico'] as const;

export async function auditarIntegridadeAtendimentoAdmin(): Promise<AtendimentoIntegridadeRelatorio> {
  if (!hasSupabaseConfig()) {
    return {
      geradoEm: new Date().toISOString(),
      snapshotUpdatedAt: null,
      resumo: {
        criticos: 0,
        alertas: 0,
        infos: 0,
        documentosAuditados: 0,
        lotesConcluidos: 0,
        linhasPlanejamento: 0,
      },
      achados: [],
      source: 'indisponivel',
      warning: 'Supabase nao configurado.',
    };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return {
      geradoEm: new Date().toISOString(),
      snapshotUpdatedAt: null,
      resumo: {
        criticos: 0,
        alertas: 0,
        infos: 0,
        documentosAuditados: 0,
        lotesConcluidos: 0,
        linhasPlanejamento: 0,
      },
      achados: [],
      source: 'indisponivel',
      warning: 'Cliente Supabase indisponivel.',
    };
  }

  try {
    const payload = await readIsoProSnapshotSlices<Record<string, unknown>>([...AUDIT_SLICE_KEYS]);
    const updatedAt =
      payload._updatedAt != null ? String(payload._updatedAt) : null;
    return auditarIntegridadeAtendimentoSnapshot(
      {
        documentos: payload.documentos as unknown[],
        atendimentos: payload.atendimentos as unknown[],
        atendimentoHistorico: payload.atendimentoHistorico as unknown[],
      },
      { snapshotUpdatedAt: updatedAt, source: 'supabase' },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao ler snapshot.';
    return {
      geradoEm: new Date().toISOString(),
      snapshotUpdatedAt: null,
      resumo: {
        criticos: 0,
        alertas: 0,
        infos: 0,
        documentosAuditados: 0,
        lotesConcluidos: 0,
        linhasPlanejamento: 0,
      },
      achados: [],
      source: 'indisponivel',
      warning: message,
    };
  }
}

export function exportarRelatorioIntegridadeCsv(relatorio: AtendimentoIntegridadeRelatorio): void {
  const csv = relatorioIntegridadeParaCsv(relatorio);
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `auditoria-atendimento-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
