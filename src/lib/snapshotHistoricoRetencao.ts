/**
 * Retencao do historico de atendimento dentro do snapshot JSON.
 * Nao apaga tabelas de comandos (isso e ops:prune-retencao).
 */

export const HISTORICO_SNAPSHOT_MAX_AGE_DAYS = 90;
export const HISTORICO_SNAPSHOT_MAX_ITEMS = 3000;

function parseIsoDate(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

function rowTimestamp(row: Record<string, unknown>): number {
  return (
    parseIsoDate(row.data) ??
    parseIsoDate(row.dataAtendimento) ??
    parseIsoDate(row.createdAt) ??
    parseIsoDate(row.updatedAt) ??
    0
  );
}

/**
 * Mantem os N itens mais recentes e/ou os dos ultimos `maxAgeDays`.
 * Preferencia: corte por idade; se ainda passar de maxItems, corta pelo timestamp.
 */
export function trimAtendimentoHistoricoArray<T extends Record<string, unknown>>(
  items: T[] | null | undefined,
  opts?: { maxAgeDays?: number; maxItems?: number; nowMs?: number },
): { items: T[]; removed: number } {
  const list = Array.isArray(items) ? [...items] : [];
  if (list.length === 0) return { items: list, removed: 0 };

  const maxAgeDays = opts?.maxAgeDays ?? HISTORICO_SNAPSHOT_MAX_AGE_DAYS;
  const maxItems = opts?.maxItems ?? HISTORICO_SNAPSHOT_MAX_ITEMS;
  const nowMs = opts?.nowMs ?? Date.now();
  const cutoff = nowMs - maxAgeDays * 24 * 60 * 60 * 1000;

  const byAge = list.filter((row) => {
    const ts = rowTimestamp(row);
    return ts === 0 || ts >= cutoff;
  });

  byAge.sort((a, b) => rowTimestamp(b) - rowTimestamp(a));
  const trimmed = byAge.length > maxItems ? byAge.slice(0, maxItems) : byAge;
  return { items: trimmed, removed: list.length - trimmed.length };
}

export function applyHistoricoRetencaoAoPayload(payload: {
  atendimentoHistorico?: unknown;
  atendimentos?: unknown;
}): { removedHistorico: number; removedAtendimentos: number } {
  let removedHistorico = 0;
  let removedAtendimentos = 0;

  if (Array.isArray(payload.atendimentoHistorico)) {
    const r = trimAtendimentoHistoricoArray(
      payload.atendimentoHistorico as Record<string, unknown>[],
    );
    payload.atendimentoHistorico = r.items;
    removedHistorico = r.removed;
  }
  if (Array.isArray(payload.atendimentos)) {
    const r = trimAtendimentoHistoricoArray(payload.atendimentos as Record<string, unknown>[], {
      maxItems: Math.min(HISTORICO_SNAPSHOT_MAX_ITEMS, 1500),
    });
    payload.atendimentos = r.items;
    removedAtendimentos = r.removed;
  }
  return { removedHistorico, removedAtendimentos };
}
