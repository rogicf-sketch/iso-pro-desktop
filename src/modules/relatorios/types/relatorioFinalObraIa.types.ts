import type { DestaqueRelatorioFinalObra, DestaqueSeveridade } from '../utils/relatorioFinalObraAnalise';
import type { SinteseAlertaRfo } from './relatorioFinalObraApresentacao.types';

export type RelatorioFinalObraIaDestaque = {
  modulo: string;
  referencia: string;
  motivo: string;
  severidade: DestaqueSeveridade;
  prioridade?: number;
  dataIso?: string;
};

export type RelatorioFinalObraIaSecao = {
  modulo: string;
  titulo?: string;
  paragrafos: string[];
};

export type RelatorioFinalObraIaResposta = {
  paragrafos: string[];
  alertas: SinteseAlertaRfo[];
  destaques: RelatorioFinalObraIaDestaque[];
  /** Narrativa por área: planejamento, recebimentos, rir, rnc, atendimentos, inventarios, relatorios_fotograficos. */
  secoes?: RelatorioFinalObraIaSecao[];
  relatoriosFotograficosDestaqueIds?: string[];
  notaAnalise?: string;
};

export type RelatorioFinalObraIaMeta = {
  utilizada: boolean;
  modelo?: string;
  erro?: string;
  notaAnalise?: string;
};

export type RelatorioFinalObraIaResultado =
  | { ok: true; resposta: RelatorioFinalObraIaResposta; modelo: string }
  | { ok: false; erro: string };

export type DestaquesConsolidadosRfo = {
  destaques: DestaqueRelatorioFinalObra[];
  priorizadosPorIa: boolean;
};
