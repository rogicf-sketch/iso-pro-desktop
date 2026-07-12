import { readIsoProSnapshotStats } from '../../../lib/isoProSnapshot';
import {
  listDocumentosPlanejamentoPageFromCloud,
  syncDocumentosPlanejamentoFromSnapshot,
} from '../../../lib/documentosPlanejamentoTabelas';
import { listRecebimentosPageFromCloud, syncRecebimentosFromSnapshot } from '../../../lib/recebimentosTabelas';
import { listInventariosPageFromCloud, syncInventariosFromSnapshot } from '../../../lib/inventariosTabelas';
import { syncRirFromSnapshot, syncRncFromSnapshot } from '../../../lib/qualidadeTabelas';
import { hasSupabaseConfig } from '../../../lib/supabase';
import { formatSnapshotSize, mensagemTamanhoSnapshot, type SnapshotSizeNivel } from '../../../lib/snapshotPayloadSize';
import type { ServiceResult } from '../../../types/common.types';

export type SnapshotSaudeNuvem = {
  payloadBytes: number;
  payloadLabel: string;
  nivel: SnapshotSizeNivel;
  mensagem: string | null;
  updatedAt: string | null;
};

/** Contagens nas tabelas de escala (não é interruptor — 0 = ainda sem sync). */
export type EscalaNuvemEstado = {
  documentos: number;
  recebimentos: number;
  inventarios: number;
  documentosErro?: string;
  recebimentosErro?: string;
  inventariosErro?: string;
};

export async function consultarEstadoEscalaNuvem(): Promise<ServiceResult<EscalaNuvemEstado | null>> {
  if (!hasSupabaseConfig()) {
    return { success: true, data: null };
  }
  try {
    const [docs, recs, inv] = await Promise.all([
      listDocumentosPlanejamentoPageFromCloud({ offset: 0, limit: 1 }),
      listRecebimentosPageFromCloud({ offset: 0, limit: 1 }),
      listInventariosPageFromCloud({ offset: 0, limit: 1 }),
    ]);
    return {
      success: true,
      data: {
        documentos: docs.total,
        recebimentos: recs.total,
        inventarios: inv.total,
        documentosErro: docs.error,
        recebimentosErro: recs.error,
        inventariosErro: inv.error,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao consultar estado da escala.';
    return { success: false, error: message };
  }
}

export async function avaliarSaudeSnapshotNuvem(): Promise<ServiceResult<SnapshotSaudeNuvem | null>> {
  if (!hasSupabaseConfig()) {
    return { success: true, data: null };
  }
  try {
    const stats = await readIsoProSnapshotStats();
    if (!stats) {
      return { success: true, data: null };
    }
    const nivel =
      stats.payloadBytes >= 15 * 1024 * 1024 ? 'critico' : stats.payloadBytes >= 5 * 1024 * 1024 ? 'aviso' : 'ok';
    return {
      success: true,
      data: {
        payloadBytes: stats.payloadBytes,
        payloadLabel: formatSnapshotSize(stats.payloadBytes),
        nivel,
        mensagem: mensagemTamanhoSnapshot(stats.payloadBytes),
        updatedAt: stats.updatedAt,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao consultar tamanho do snapshot.';
    return { success: false, error: message };
  }
}

/** Activa/repara tabelas de desenhos (Fase B) a partir do snapshot. */
export async function sincronizarDocumentosPlanejamentoTabelas(): Promise<
  ServiceResult<{ documentos: number; itens: number }>
> {
  if (!hasSupabaseConfig()) {
    return { success: false, error: 'Supabase nao configurado.' };
  }
  const r = await syncDocumentosPlanejamentoFromSnapshot();
  if (!r.ok) {
    return { success: false, error: r.error ?? 'Falha ao sincronizar desenhos para tabelas.' };
  }
  return {
    success: true,
    data: { documentos: r.documentos ?? 0, itens: r.itens ?? 0 },
  };
}

/** Activa/repara tabelas de recebimentos (P1) a partir do snapshot. */
export async function sincronizarRecebimentosTabelas(): Promise<
  ServiceResult<{ recebimentos: number; itens: number }>
> {
  if (!hasSupabaseConfig()) {
    return { success: false, error: 'Supabase nao configurado.' };
  }
  const r = await syncRecebimentosFromSnapshot();
  if (!r.ok) {
    return { success: false, error: r.error ?? 'Falha ao sincronizar recebimentos para tabelas.' };
  }
  return {
    success: true,
    data: { recebimentos: r.recebimentos ?? 0, itens: r.itens ?? 0 },
  };
}

/** Activa/repara inventarios + RIR + RNC (P2). */
export async function sincronizarQualidadeInventarioTabelas(): Promise<
  ServiceResult<{ inventarios: number; rir: number; rnc: number }>
> {
  if (!hasSupabaseConfig()) {
    return { success: false, error: 'Supabase nao configurado.' };
  }
  const [inv, rir, rnc] = await Promise.all([
    syncInventariosFromSnapshot(),
    syncRirFromSnapshot(),
    syncRncFromSnapshot(),
  ]);
  if (!inv.ok) return { success: false, error: inv.error ?? 'Falha ao sincronizar inventarios.' };
  if (!rir.ok) return { success: false, error: rir.error ?? 'Falha ao sincronizar RIR.' };
  if (!rnc.ok) return { success: false, error: rnc.error ?? 'Falha ao sincronizar RNC.' };
  return {
    success: true,
    data: {
      inventarios: inv.inventarios ?? 0,
      rir: rir.rir ?? 0,
      rnc: rnc.rnc ?? 0,
    },
  };
}
