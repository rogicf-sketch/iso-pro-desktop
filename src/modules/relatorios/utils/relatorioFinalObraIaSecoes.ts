import type { RelatorioFinalObraDados } from '../types/relatorioFinalObra.types';
import type { AnaliseSecaoModuloRfo } from '../types/relatorioFinalObraApresentacao.types';
import type { RelatorioFinalObraIaSecao } from '../types/relatorioFinalObraIa.types';

/** Ordem de exibição no PDF. */
export const ORDEM_SECOES_MODULO_RFO = [
  'planejamento',
  'recebimentos',
  'rir',
  'rnc',
  'atendimentos',
  'inventarios',
  'relatorios_fotograficos',
  'geral',
] as const;

export type ModuloSecaoRfo = (typeof ORDEM_SECOES_MODULO_RFO)[number];

const TITULOS_PADRAO: Record<ModuloSecaoRfo, string> = {
  planejamento: 'Planejamento de materiais',
  recebimentos: 'Recebimentos e conferência',
  rir: 'Inspeção de recebimento (RIR)',
  rnc: 'Não conformidades (RNC)',
  atendimentos: 'Atendimentos ao planejamento',
  inventarios: 'Inventários',
  relatorios_fotograficos: 'Relatórios fotográficos',
  geral: 'Síntese transversal',
};

const ALIAS_MODULO: Record<string, ModuloSecaoRfo> = {
  planejamento: 'planejamento',
  documentos: 'planejamento',
  documento: 'planejamento',
  recebimentos: 'recebimentos',
  recebimento: 'recebimentos',
  rir: 'rir',
  inspecao: 'rir',
  rnc: 'rnc',
  'nao conformidade': 'rnc',
  'nao conformidades': 'rnc',
  'não conformidade': 'rnc',
  atendimentos: 'atendimentos',
  atendimento: 'atendimentos',
  inventarios: 'inventarios',
  inventario: 'inventarios',
  relatorios_fotograficos: 'relatorios_fotograficos',
  'relatorio fotografico': 'relatorios_fotograficos',
  'relatório fotográfico': 'relatorios_fotograficos',
  rf: 'relatorios_fotograficos',
  geral: 'geral',
  encerramento: 'geral',
};

function normalizarChaveModulo(raw: string): ModuloSecaoRfo | null {
  const t = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9_\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return null;
  if (ALIAS_MODULO[t]) return ALIAS_MODULO[t];
  for (const [alias, key] of Object.entries(ALIAS_MODULO)) {
    if (t.includes(alias) || alias.includes(t)) return key;
  }
  return null;
}

function moduloTemRegistros(dados: RelatorioFinalObraDados, modulo: ModuloSecaoRfo): boolean {
  switch (modulo) {
    case 'planejamento':
      return dados.totais.documentos > 0;
    case 'recebimentos':
      return dados.totais.recebimentos > 0;
    case 'rir':
      return dados.totais.rir > 0;
    case 'rnc':
      return dados.totais.rnc > 0;
    case 'atendimentos':
      return dados.totais.atendimentos > 0;
    case 'inventarios':
      return dados.totais.inventarios > 0;
    case 'relatorios_fotograficos':
      return dados.totais.relatoriosFotograficos > 0;
    case 'geral':
      return true;
    default:
      return false;
  }
}

/** Normaliza, filtra vazios e ordena seções vindas da IA. */
export function normalizarSecoesModuloIa(
  secoes: RelatorioFinalObraIaSecao[] | undefined,
  dados: RelatorioFinalObraDados,
): AnaliseSecaoModuloRfo[] {
  if (!secoes?.length) return [];

  const porModulo = new Map<ModuloSecaoRfo, AnaliseSecaoModuloRfo>();

  for (const s of secoes) {
    const chave = normalizarChaveModulo(s.modulo || s.titulo || '');
    if (!chave) continue;
    if (!moduloTemRegistros(dados, chave) && chave !== 'geral') continue;

    const paragrafos = (s.paragrafos ?? []).map((p) => p.trim()).filter(Boolean);
    if (paragrafos.length === 0) continue;

    const titulo = (s.titulo ?? '').trim() || TITULOS_PADRAO[chave];
    const existente = porModulo.get(chave);
    if (existente) {
      existente.paragrafos.push(...paragrafos);
    } else {
      porModulo.set(chave, { modulo: chave, titulo, paragrafos: [...paragrafos] });
    }
  }

  return ORDEM_SECOES_MODULO_RFO.map((m) => porModulo.get(m)).filter((x): x is AnaliseSecaoModuloRfo => !!x);
}
