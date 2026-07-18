import type { Atendimento, AtendimentoItem, DadosReciboAtendimento, DadosReciboEstorno, EstornoLogRegistro } from '../types/atendimento.types';
import { listarEstornoLogDoLote } from '../services/atendimento.service';
import { montarDadosReciboEstorno } from './montarDadosReciboEstorno';
import { montarDadosReciboParaAtendimento } from './montarDadosReciboParaAtendimento';

/** Converte linhas do log de estorno em itens de recibo (quantidades devolvidas). */
export function itensAtendimentoFromEstornoLog(entries: EstornoLogRegistro[]): AtendimentoItem[] {
  return entries.map((e) => ({
    id: String(e.atendimentoItemId || e.id),
    documentoItemId: '',
    materialId: null,
    codigoMaterial: e.codigoMaterial,
    descricaoMaterial: e.descricaoMaterial,
    unidade: e.unidade || 'UN',
    quantidadeAtendida: Number(e.quantidadeEstornada) || 0,
    quantidadeRetiradaOriginal: Number(e.quantidadeRetiradaOriginal) || Number(e.quantidadeEstornada) || 0,
    documentoNumero: e.documentoNumero,
  }));
}

export type ReciboVisualizarHistorico =
  | { tipo: 'estorno'; dados: DadosReciboEstorno }
  | { tipo: 'retirada'; dados: DadosReciboAtendimento };

/**
 * Visualizar no historico: lote totalmente estornado tem `itens: []` (saldo voltou ao planejamento).
 * Sem isto o recibo de retirada saia vazio (Total 0). Prefere o recibo de estorno com o log auditavel.
 */
export async function montarReciboVisualizarHistorico(at: Atendimento): Promise<ReciboVisualizarHistorico> {
  const precisaEstorno =
    at.status === 'estornado' || (Array.isArray(at.itens) && at.itens.length === 0);

  if (precisaEstorno) {
    const log = await listarEstornoLogDoLote(at.numero);
    if (log.length > 0) {
      const itens = itensAtendimentoFromEstornoLog(log);
      const ultimo = log[log.length - 1]!;
      const dados = await montarDadosReciboEstorno(
        { ...at, itens },
        {
          nomeQuemEstorna: ultimo.nomeQuemEstorna || '—',
          nomeQuemDevolve: ultimo.nomeQuemDevolve || '—',
          motivoEstorno: ultimo.motivoEstorno || 'Estorno do lote',
        },
        itens,
        Boolean(ultimo.estornoParcialLote),
      );
      return { tipo: 'estorno', dados };
    }
  }

  return { tipo: 'retirada', dados: await montarDadosReciboParaAtendimento(at) };
}
