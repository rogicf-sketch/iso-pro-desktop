import { buscarDocumentoPorIdOuNumero } from '../../documentos/services/documentos.service';
import type { Atendimento, AtendimentoItem } from '../types/atendimento.types';
import { atendimentoTemVariosDocumentos, numerosDocumentosDistintosItens } from './estornoDocumento.utils';

export type MetadadosDocumentoAtendimento = {
  documentoDescricao: string;
  documentoRevisao: string;
  documentoResponsavel: string;
  documentoTitulo: string;
};

const PLACEHOLDER = '(Documento nao encontrado ou indisponivel.)';

/** Metadados de cabecalho para recibo/modal quando o lote tem um ou varios desenhos. */
export async function montarMetadadosDocumentoAtendimento(
  at: Atendimento,
  itensRef?: AtendimentoItem[],
): Promise<MetadadosDocumentoAtendimento> {
  const itens = itensRef ?? at.itens;

  if (atendimentoTemVariosDocumentos(at, itens)) {
    const nums = numerosDocumentosDistintosItens(itens);
    const partes: string[] = [];
    for (const num of nums) {
      const r = await buscarDocumentoPorIdOuNumero('', num);
      if (r.success && r.data?.descricao) {
        partes.push(`${num}: ${r.data.descricao.trim()}`);
      } else {
        partes.push(num);
      }
    }
    return {
      documentoTitulo: 'Varios desenhos (ver coluna Documento)',
      documentoDescricao: partes.length ? partes.join(' · ') : PLACEHOLDER,
      documentoRevisao: '—',
      documentoResponsavel: '—',
    };
  }

  const docPrincipal = await buscarDocumentoPorIdOuNumero(at.documentoId, at.documentoNumero);
  const doc = docPrincipal.success && docPrincipal.data ? docPrincipal.data : null;
  if (doc) {
    const titulo = `${at.documentoNumero} Rev. ${doc.revisao || '—'}`;
    return {
      documentoTitulo: titulo,
      documentoDescricao: doc.descricao?.trim() || PLACEHOLDER,
      documentoRevisao: doc.revisao || '—',
      documentoResponsavel: doc.responsavel || '—',
    };
  }

  const nums = numerosDocumentosDistintosItens(itens);
  if (nums.length === 1) {
    const r = await buscarDocumentoPorIdOuNumero('', nums[0]!);
    if (r.success && r.data) {
      const titulo = `${nums[0]} Rev. ${r.data.revisao || '—'}`;
      return {
        documentoTitulo: titulo,
        documentoDescricao: r.data.descricao?.trim() || PLACEHOLDER,
        documentoRevisao: r.data.revisao || '—',
        documentoResponsavel: r.data.responsavel || '—',
      };
    }
  }

  const tituloFallback =
    at.documentoNumero && at.documentoNumero !== 'MULTIPLOS' ? `${at.documentoNumero} Rev. —` : '—';
  return {
    documentoTitulo: tituloFallback,
    documentoDescricao: PLACEHOLDER,
    documentoRevisao: '—',
    documentoResponsavel: '—',
  };
}
