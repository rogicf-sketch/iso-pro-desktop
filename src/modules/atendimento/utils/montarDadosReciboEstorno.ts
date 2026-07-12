import type { Atendimento, AtendimentoItem, DadosReciboEstorno } from '../types/atendimento.types';
import { atendimentoTemVariosDocumentos } from './estornoDocumento.utils';
import { montarMetadadosDocumentoAtendimento } from './montarMetadadosDocumentoAtendimento';

export async function montarDadosReciboEstorno(
  at: Atendimento,
  campos: { nomeQuemEstorna: string; nomeQuemDevolve: string; motivoEstorno: string },
  itensEstorno: AtendimentoItem[],
  estornoParcial: boolean,
): Promise<DadosReciboEstorno> {
  const meta = await montarMetadadosDocumentoAtendimento(at, itensEstorno);
  const documentoNumero =
    atendimentoTemVariosDocumentos(at, itensEstorno) ? 'MULTIPLOS' : at.documentoNumero;

  return {
    atendimento: at,
    documentoNumero,
    documentoTitulo: meta.documentoTitulo,
    documentoRevisao: meta.documentoRevisao,
    documentoDescricao: meta.documentoDescricao,
    documentoResponsavel: meta.documentoResponsavel,
    nomeQuemEstorna: campos.nomeQuemEstorna.trim(),
    nomeQuemDevolve: campos.nomeQuemDevolve.trim(),
    motivoEstorno: campos.motivoEstorno.trim(),
    itensEstorno,
    estornoParcial,
  };
}
