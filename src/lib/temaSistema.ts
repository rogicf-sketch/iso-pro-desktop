import type { ConfiguracaoSistema } from '../modules/configuracoes/types/configuracao.types';

export type TemaSistemaId = ConfiguracaoSistema['tema'];

export type TemaSistemaOpcao = {
  id: TemaSistemaId;
  label: string;
  hint: string;
};

/** Rótulos oficiais na UI (Configurações e preferência por utilizador). */
export const TEMAS_SISTEMA_OPCOES: TemaSistemaOpcao[] = [
  {
    id: 'campo',
    label: 'Campo claro (recomendado)',
    hint: 'Off-white e azul I.S.O — limpo, alinhado ao mobile, ideal para uso longo.',
  },
  {
    id: 'hibrido',
    label: 'Híbrido grafite + laranja',
    hint: 'Shell escuro com área de trabalho clara e acentos laranja.',
  },
  {
    id: 'neon',
    label: 'Neon verde',
    hint: 'Grafite premium com esmeralda — identidade I.S.O PRO, menos fadiga visual.',
  },
  { id: 'padrao', label: 'Padrão escuro', hint: 'Slate azulado equilibrado para operação diária.' },
  { id: 'escuro', label: 'Escuro profundo', hint: 'Alto contraste com azul elétrico contido.' },
  { id: 'verde', label: 'Verde floresta', hint: 'Carvão-floresta com acentos esmeralda suaves.' },
];

const LEGACY_TEMA_MAP: Record<string, TemaSistemaId> = {
  claro: 'hibrido',
};

export function normalizeTemaSistemaId(raw: unknown, fallback: TemaSistemaId = 'campo'): TemaSistemaId {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  const key = raw.trim();
  if (key in LEGACY_TEMA_MAP) return LEGACY_TEMA_MAP[key];
  return TEMAS_SISTEMA_OPCOES.some((t) => t.id === key) ? (key as TemaSistemaId) : fallback;
}

export function labelTemaSistema(id: TemaSistemaId): string {
  return TEMAS_SISTEMA_OPCOES.find((t) => t.id === id)?.label ?? id;
}
