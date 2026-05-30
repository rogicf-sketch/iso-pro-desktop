/**
 * Listas operacionais do `iso_pro_snapshot` zeradas em "Limpar cadastros".
 * Manter em sync com `supabase/functions/purge_cloud_cadastros/index.ts` (`CHAVES_LISTAS_CADASTRO`).
 */
export const SNAPSHOT_CHAVES_LIMPAR_CADASTROS = [
  'materiais',
  'fornecedores',
  'colaboradores',
  'recebimentos',
  'rirRegistros',
  'rncRegistros',
  'documentos',
  'atendimentos',
  'atendimentoHistorico',
  'atendimentoLotes',
  'inventarios',
  'equipamentos',
  'etiquetas',
  'estoqueAjustes',
  'disciplinas',
  'unidades',
] as const;

const CHAVES_REMOVER = new Set(['usuariosSistema']);

/** Monta payload do snapshot com cadastros vazios e `configuracoesSistema` preservada. */
export function montarPayloadCadastrosLimpos(raw: unknown): Record<string, unknown> {
  const base =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? ({ ...raw } as Record<string, unknown>) : {};

  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(base)) {
    if (CHAVES_REMOVER.has(k)) continue;
    if (SNAPSHOT_CHAVES_LIMPAR_CADASTROS.includes(k as (typeof SNAPSHOT_CHAVES_LIMPAR_CADASTROS)[number])) continue;
    if (k === 'dataAtualizacao') continue;
    next[k] = v;
  }
  for (const k of SNAPSHOT_CHAVES_LIMPAR_CADASTROS) {
    next[k] = [];
  }
  if (!('configuracoesSistema' in next) || next.configuracoesSistema == null) {
    next.configuracoesSistema = base.configuracoesSistema ?? {};
  }
  next.dataAtualizacao = new Date().toISOString();
  return next;
}
