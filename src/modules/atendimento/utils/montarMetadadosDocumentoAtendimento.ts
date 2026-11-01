import { lerCabecalhoDocumentoPlanejamento } from '../../../lib/documentosPlanejamentoTabelas';
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
    const cabecalhos = await Promise.all(
      nums.map(async (num) => ({ num, cab: await lerCabecalhoDocumentoPlanejamento({ numero: num }) })),
    );
    for (const { num, cab } of cabecalhos) {
      if (cab?.descricao) {
        partes.push(`${num}: ${cab.descricao}`);
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

  const doc = await lerCabecalhoDocumentoPlanejamento({
    id: at.documentoId,
    numero: at.documentoId?.trim() ? null : at.documentoNumero,
  });
  if (doc && (doc.descricao || doc.revisao || doc.responsavel)) {
    const numero = at.documentoNumero?.trim() || doc.numero;
    const titulo = numero && numero !== 'MULTIPLOS' ? `${numero} Rev. ${doc.revisao || '—'}` : '—';
    return {
      documentoTitulo: titulo,
      documentoDescricao: doc.descricao || PLACEHOLDER,
      documentoRevisao: doc.revisao || '—',
      documentoResponsavel: doc.responsavel || '—',
    };
  }

  const nums = numerosDocumentosDistintosItens(itens);
  if (nums.length === 1) {
    const r = await lerCabecalhoDocumentoPlanejamento({ numero: nums[0] });
    if (r && (r.descricao || r.revisao || r.responsavel)) {
      const titulo = `${nums[0]} Rev. ${r.revisao || '—'}`;
      return {
        documentoTitulo: titulo,
        documentoDescricao: r.descricao || PLACEHOLDER,
        documentoRevisao: r.revisao || '—',
        documentoResponsavel: r.responsavel || '—',
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
