import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';
import type { Material } from '../types/material.types';

/** Percentual aplicado uma vez aos cadastros antigos que ainda tinham alerta desligado (0). */
export const PERCENTUAL_ALERTA_ESTOQUE_LEGADO = 20;

function backfillFlagStorageKey(): string {
  return getScopedIsoProStorageKey('iso-pro-materiais-backfill-percentual-alerta-v1');
}

export function backfillPercentualAlertaEstoqueJaExecutado(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(backfillFlagStorageKey()) === '1';
}

/**
 * Migra cadastros existentes: estoqueMinimo 0 vira 20% (alerta sobre o planejamento).
 * Executa uma unica vez por ambiente; novos materiais com 0 permanecem sem alerta.
 */
export function backfillPercentualAlertaEstoqueMateriais(items: Material[]): { next: Material[]; alterou: boolean } {
  if (typeof localStorage !== 'undefined' && backfillPercentualAlertaEstoqueJaExecutado()) {
    return { next: items, alterou: false };
  }

  let alterou = false;
  const next = items.map((m) => {
    if (m.estoqueMinimo !== 0) return m;
    alterou = true;
    return { ...m, estoqueMinimo: PERCENTUAL_ALERTA_ESTOQUE_LEGADO };
  });

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(backfillFlagStorageKey(), '1');
  }

  return { next, alterou };
}
