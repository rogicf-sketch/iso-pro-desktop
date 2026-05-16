/**
 * Listas editaveis de disciplinas e unidades para o cadastro de materiais (equivalente aos modais do I.S.O PRO antigo).
 * Persistencia local; combinadas na UI com valores ja usados nos materiais.
 */

import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';
import { parseMateriaisDominiosPersistido } from '../schemas/materiaisDominiosPersistido.zod';

function materiaisDominiosStorageKey(): string {
  return getScopedIsoProStorageKey('iso-pro-desktop-materiais-dominios');
}

export const DEFAULT_DISCIPLINAS_CADASTRO = [
  'Tubulação',
  'Elétrica',
  'Instrumentação',
  'Estrutura Metálica',
  'Equipamentos',
] as const;

export const DEFAULT_UNIDADES_CADASTRO = ['UN', 'M', 'KG', 'PC', 'MT'] as const;

export type MateriaisDominiosListas = {
  disciplinas: string[];
  unidades: string[];
};

function normalizarLista(arr: string[]): string[] {
  return [...new Set(arr.map((s) => s.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function readMateriaisDominiosListas(): MateriaisDominiosListas {
  const defaults: MateriaisDominiosListas = {
    disciplinas: [...DEFAULT_DISCIPLINAS_CADASTRO],
    unidades: [...DEFAULT_UNIDADES_CADASTRO],
  };

  try {
    const raw = localStorage.getItem(materiaisDominiosStorageKey());
    if (!raw) {
      return defaults;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return defaults;
    }

    const p = parseMateriaisDominiosPersistido(parsed);
    if (!p) {
      return defaults;
    }

    return {
      disciplinas:
        Array.isArray(p.disciplinas) && p.disciplinas.length > 0
          ? normalizarLista(p.disciplinas.map(String))
          : [...DEFAULT_DISCIPLINAS_CADASTRO],
      unidades:
        Array.isArray(p.unidades) && p.unidades.length > 0
          ? normalizarLista(p.unidades.map(String))
          : [...DEFAULT_UNIDADES_CADASTRO],
    };
  } catch {
    return defaults;
  }
}

export function writeMateriaisDominiosListas(next: MateriaisDominiosListas): void {
  localStorage.setItem(
    materiaisDominiosStorageKey(),
    JSON.stringify({
      disciplinas: normalizarLista(next.disciplinas),
      unidades: normalizarLista(next.unidades),
    }),
  );
}
