import type { Material } from '../types/material.types';
import { gerarProximoCodigoBarrasEan13 } from './gerarCodigoBarrasEan13';

/**
 * Atribui EAN-13 interno a todo material sem codigo de barras, em ordem estavel (codigo, id).
 * Usado na migracao de cadastros anteriores a esta funcionalidade.
 */
export function backfillCodigosBarrasMateriais(items: Material[]): { next: Material[]; alterou: boolean } {
  const working = items.map((m) => ({ ...m }));
  const indicesSem = working
    .map((m, i) => (!m.codigoBarras?.trim() ? i : -1))
    .filter((i): i is number => i >= 0);

  if (indicesSem.length === 0) {
    return { next: working, alterou: false };
  }

  const sortedIndices = [...indicesSem].sort((i, j) => {
    const ca = working[i]!.codigo.localeCompare(working[j]!.codigo);
    if (ca !== 0) return ca;
    return working[i]!.id.localeCompare(working[j]!.id);
  });

  for (const idx of sortedIndices) {
    const cb = gerarProximoCodigoBarrasEan13(working);
    working[idx] = { ...working[idx], codigoBarras: cb };
  }

  return { next: working, alterou: true };
}
