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
    hint: 'Branco suave e azul I.S.O — alinhado ao app mobile, ideal para uso longo em escritório.',
  },
  {
    id: 'hibrido',
    label: 'Híbrido grafite + laranja',
    hint: 'Barra lateral escura com destaque laranja; área de trabalho clara.',
  },
  {
    id: 'neon',
    label: 'Neon verde',
    hint: 'Escuro com verde iluminado — identidade clássica I.S.O PRO.',
  },
  { id: 'padrao', label: 'Padrão escuro', hint: 'Grafite azulado equilibrado.' },
  { id: 'escuro', label: 'Escuro profundo', hint: 'Contraste alto, estilo utilitário.' },
  { id: 'verde', label: 'Verde floresta', hint: 'Escuro com acentos esmeralda.' },
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
