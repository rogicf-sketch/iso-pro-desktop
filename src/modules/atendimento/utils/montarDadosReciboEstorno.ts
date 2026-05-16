import { buscarDocumentoPorIdOuNumero } from '../../documentos/services/documentos.service';
import type { Atendimento, AtendimentoItem, DadosReciboEstorno } from '../types/atendimento.types';

export async function montarDadosReciboEstorno(
  at: Atendimento,
  campos: { nomeQuemEstorna: string; nomeQuemDevolve: string; motivoEstorno: string },
  itensEstorno: AtendimentoItem[],
  estornoParcial: boolean,
): Promise<DadosReciboEstorno> {
  const docResult = await buscarDocumentoPorIdOuNumero(at.documentoId, at.documentoNumero);
  const doc = docResult.success && docResult.data ? docResult.data : null;

  return {
    atendimento: at,
    documentoNumero: at.documentoNumero,
    documentoRevisao: doc?.revisao ?? '—',
    documentoDescricao: doc?.descricao ?? '(Documento nao encontrado ou indisponivel.)',
    documentoResponsavel: doc?.responsavel ?? '—',
    nomeQuemEstorna: campos.nomeQuemEstorna.trim(),
    nomeQuemDevolve: campos.nomeQuemDevolve.trim(),
    motivoEstorno: campos.motivoEstorno.trim(),
    itensEstorno,
    estornoParcial,
  };
}
