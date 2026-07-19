/**
 * Listas editaveis de disciplinas e unidades para o cadastro de materiais (equivalente aos modais do I.S.O PRO antigo).
 * Persistencia local; combinadas na UI com valores ja usados nos materiais.
 */

import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';
import { parseMateriaisDominiosPersistido } from '../schemas/materiaisDominiosPersistido.zod';
import { DESCRICOES_UNIDADE_PADRAO, normalizarSiglaUnidade } from '../utils/unidadeCadastroRotulo';

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
  /** Descrições opcionais por sigla — só usadas no modal Unidades. */
  unidadeDescricoes: Record<string, string>;
};

function normalizarLista(arr: string[]): string[] {
  return [...new Set(arr.map((s) => s.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function normalizarUnidadeDescricoes(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const sigla = normalizarSiglaUnidade(k);
    const desc = String(v ?? '').trim();
    if (sigla && desc) out[sigla] = desc;
  }
  return out;
}

function descricoesPadraoParaUnidades(unidades: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const u of unidades) {
    const sigla = normalizarSiglaUnidade(u);
    const padrao = DESCRICOES_UNIDADE_PADRAO[sigla];
    if (padrao) out[sigla] = padrao;
  }
  return out;
}

export function readMateriaisDominiosListas(): MateriaisDominiosListas {
  const defaults: MateriaisDominiosListas = {
    disciplinas: [...DEFAULT_DISCIPLINAS_CADASTRO],
    unidades: [...DEFAULT_UNIDADES_CADASTRO],
    unidadeDescricoes: descricoesPadraoParaUnidades([...DEFAULT_UNIDADES_CADASTRO]),
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

    const unidades =
      Array.isArray(p.unidades) && p.unidades.length > 0
        ? normalizarLista(p.unidades.map(String))
        : [...DEFAULT_UNIDADES_CADASTRO];
    const extras = normalizarUnidadeDescricoes(p.unidadeDescricoes);
    return {
      disciplinas:
        Array.isArray(p.disciplinas) && p.disciplinas.length > 0
          ? normalizarLista(p.disciplinas.map(String))
          : [...DEFAULT_DISCIPLINAS_CADASTRO],
      unidades,
      unidadeDescricoes: { ...descricoesPadraoParaUnidades(unidades), ...extras },
    };
  } catch {
    return defaults;
  }
}

export function writeMateriaisDominiosListas(next: MateriaisDominiosListas): void {
  const unidades = normalizarLista(next.unidades);
  const unidadeDescricoes = normalizarUnidadeDescricoes(next.unidadeDescricoes);
  // Mantém só descrições de unidades ainda na lista (e as padrão).
  const filtradas: Record<string, string> = {};
  for (const u of unidades) {
    const sigla = normalizarSiglaUnidade(u);
    const desc = unidadeDescricoes[sigla] ?? DESCRICOES_UNIDADE_PADRAO[sigla];
    if (desc) filtradas[sigla] = desc;
  }
  localStorage.setItem(
    materiaisDominiosStorageKey(),
    JSON.stringify({
      disciplinas: normalizarLista(next.disciplinas),
      unidades,
      unidadeDescricoes: filtradas,
    }),
  );
}
