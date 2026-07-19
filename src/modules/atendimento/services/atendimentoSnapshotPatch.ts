/** Chaves fundidas por id no RPC `iso_pro_patch_snapshot`. */
export const SNAPSHOT_ATENDIMENTO_PATCH_MERGE_KEYS = [
  'documentos',
  'atendimentos',
  'atendimentoHistorico',
] as const;

export type SnapshotSlice = Record<string, unknown> & {
  documentos?: Array<Record<string, unknown>>;
  atendimentos?: Array<{ id?: unknown }>;
  atendimentoHistorico?: Array<{ id?: unknown }>;
  atendimentoEstornoLog?: unknown[];
  configuracoesSistema?: Record<string, unknown>;
  dataAtualizacao?: string;
};

function documentoAlteradoPorAtendimento(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): boolean {
  const itemsBefore = (before.itens ?? []) as Array<{ quantidadeAtendida?: number }>;
  const itemsAfter = (after.itens ?? []) as Array<{ quantidadeAtendida?: number }>;
  if (itemsBefore.length !== itemsAfter.length) return true;
  for (let i = 0; i < itemsBefore.length; i++) {
    const qBefore = Number(itemsBefore[i]?.quantidadeAtendida ?? 0);
    const qAfter = Number(itemsAfter[i]?.quantidadeAtendida ?? 0);
    if (Math.abs(qBefore - qAfter) > 1e-9) return true;
  }
  return false;
}

function novosRegistrosPorId<T extends { id?: unknown }>(base: T[], next: T[]): T[] {
  const baseIds = new Set(base.map((r) => r.id).filter((id) => id != null && id !== ''));
  return next.filter((r) => {
    const id = r.id;
    return id != null && id !== '' && !baseIds.has(id);
  });
}

function registrosAlteradosPorId<T extends { id?: unknown }>(base: T[], next: T[]): T[] {
  const nextById = new Map(next.map((r) => [String(r.id ?? ''), r]));
  const changed: T[] = [];
  for (const row of base) {
    const id = String(row.id ?? '');
    const updated = nextById.get(id);
    if (updated && JSON.stringify(updated) !== JSON.stringify(row)) {
      changed.push(updated);
    }
  }
  for (const row of next) {
    const id = String(row.id ?? '');
    if (!id) continue;
    if (!base.some((b) => String(b.id ?? '') === id)) {
      changed.push(row);
    }
  }
  return changed;
}

/**
 * Patch mínimo para gravação enterprise: delta para comando RPC + merge por id no patch fallback.
 */
export function buildDesktopAtendimentoPatchDelta(
  baseline: SnapshotSlice,
  next: SnapshotSlice,
): {
  patch: Record<string, unknown>;
  mergeKeys: readonly string[];
  patchWithoutMerge: Record<string, unknown>;
  comandoPatch: Record<string, unknown>;
} {
  const baseDocs = baseline.documentos ?? [];
  const nextDocs = next.documentos ?? [];
  const nextById = new Map(nextDocs.map((d) => [String(d.id ?? ''), d]));

  const changedDocs: Array<Record<string, unknown>> = [];
  for (const baseDoc of baseDocs) {
    const id = String(baseDoc.id ?? '');
    const nextDoc = nextById.get(id);
    if (nextDoc && documentoAlteradoPorAtendimento(baseDoc, nextDoc)) {
      changedDocs.push(nextDoc);
    }
  }
  for (const nextDoc of nextDocs) {
    const id = String(nextDoc.id ?? '');
    if (!id) continue;
    if (!baseDocs.some((d) => String(d.id ?? '') === id)) {
      changedDocs.push(nextDoc);
    }
  }

  const baseHist = baseline.atendimentoHistorico ?? [];
  const nextHist = next.atendimentoHistorico ?? [];
  const newHist = novosRegistrosPorId(baseHist, nextHist);

  const baseAtend = baseline.atendimentos ?? [];
  const nextAtend = next.atendimentos ?? [];
  const changedAtend = registrosAlteradosPorId(baseAtend, nextAtend);

  const patch: Record<string, unknown> = {
    dataAtualizacao: next.dataAtualizacao ?? new Date().toISOString(),
  };
  if (changedDocs.length) patch.documentos = changedDocs;
  if (changedAtend.length) patch.atendimentos = changedAtend;
  if (newHist.length) patch.atendimentoHistorico = newHist;

  const baseEstorno = baseline.atendimentoEstornoLog ?? [];
  const nextEstorno = next.atendimentoEstornoLog ?? [];
  const newEstorno = novosRegistrosPorId(
    baseEstorno as Array<{ id?: unknown }>,
    nextEstorno as Array<{ id?: unknown }>,
  );
  if (newEstorno.length === 0 && nextEstorno.length > baseEstorno.length) {
    patch.atendimentoEstornoLog = nextEstorno.slice(baseEstorno.length);
  } else if (newEstorno.length) {
    patch.atendimentoEstornoLog = newEstorno;
  }

  const sequenciaBase = baseline.configuracoesSistema?.sequenciaAtendimento;
  const sequenciaNext = next.configuracoesSistema?.sequenciaAtendimento;
  if (sequenciaNext !== sequenciaBase) {
    patch.configuracoesSistema = {
      ...(baseline.configuracoesSistema ?? {}),
      sequenciaAtendimento: sequenciaNext,
    };
  }

  const comandoPatch: Record<string, unknown> = {
    dataAtualizacao: patch.dataAtualizacao,
  };
  if (changedDocs.length) comandoPatch.documentos = changedDocs;
  if (changedAtend.length) comandoPatch.atendimentos = changedAtend;
  if (newHist.length) comandoPatch.atendimentoHistorico = newHist;
  if (patch.atendimentoEstornoLog) comandoPatch.atendimentoEstornoLog = patch.atendimentoEstornoLog;
  if (patch.configuracoesSistema) comandoPatch.configuracoesSistema = patch.configuracoesSistema;

  const patchWithoutMerge: Record<string, unknown> = {
    dataAtualizacao: patch.dataAtualizacao,
  };
  if (next.documentos?.length) patchWithoutMerge.documentos = next.documentos;
  // Nunca meter atendimentos / atendimentoHistorico no fallback sem merge: um delta parcial
  // substituiria a lista completa e apagaria lotes antigos. O caminho seguro
  // e sempre o patch com mergeKeys (append por id) ou o RPC mobile.
  if (next.atendimentoEstornoLog?.length) patchWithoutMerge.atendimentoEstornoLog = next.atendimentoEstornoLog;
  if (next.configuracoesSistema) patchWithoutMerge.configuracoesSistema = next.configuracoesSistema;

  return {
    patch,
    mergeKeys: SNAPSHOT_ATENDIMENTO_PATCH_MERGE_KEYS,
    patchWithoutMerge,
    comandoPatch,
  };
}

export function deltaAtendimentoTemConteudoComando(patch: Record<string, unknown>): boolean {
  for (const k of ['documentos', 'atendimentoHistorico', 'atendimentoLotes', 'atendimentos', 'atendimentoEstornoLog'] as const) {
    const v = patch[k];
    if (Array.isArray(v) && v.length > 0) return true;
  }
  const cfg = patch.configuracoesSistema as Record<string, unknown> | undefined;
  return cfg != null && 'sequenciaAtendimento' in cfg;
}

export function deltaAtendimentoTemConteudoPatch(patch: Record<string, unknown>): boolean {
  if (deltaAtendimentoTemConteudoComando(patch)) return true;
  for (const k of ['atendimentos', 'atendimentoEstornoLog'] as const) {
    const v = patch[k];
    if (Array.isArray(v) && v.length > 0) return true;
  }
  return false;
}
