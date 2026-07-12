import { codigoMaterialKey } from '../../estoque/saldoFromSnapshot';
import type { DocumentoPlanejamentoStored } from '../../../lib/snapshotDocumentosReconciliacao';
import type { Atendimento, AtendimentoItem } from '../types/atendimento.types';

export type DocumentoStoredEstorno = DocumentoPlanejamentoStored;

function normalizarNumeroDocumento(n: string | undefined | null): string {
  return String(n ?? '').trim();
}

function numerosDocumentoEquivalentes(a: string, b: string): boolean {
  const x = normalizarNumeroDocumento(a);
  const y = normalizarNumeroDocumento(b);
  if (!x || !y) return false;
  return x === y;
}

export function indiceDocumentoPorNumero(documentos: DocumentoStoredEstorno[], numero: string): number {
  const n = normalizarNumeroDocumento(numero);
  if (!n || n === '-' || n.toUpperCase() === 'MULTIPLOS') return -1;
  return documentos.findIndex((d) => numerosDocumentoEquivalentes(String(d.numero ?? ''), n));
}

/** Localiza o desenho no planejamento para reverter `quantidadeAtendida` de um item do lote. */
export function resolverIndiceDocumentoParaItemEstorno(
  documentos: DocumentoStoredEstorno[],
  atendimento: Atendimento,
  item: AtendimentoItem,
): number {
  const docItemId = String(item.documentoItemId ?? '').trim();
  if (docItemId) {
    const idx = documentos.findIndex((d) => (d.itens ?? []).some((it) => String(it.id) === docItemId));
    if (idx >= 0) return idx;
  }

  const numItem = normalizarNumeroDocumento(item.documentoNumero);
  if (numItem) {
    const idx = indiceDocumentoPorNumero(documentos, numItem);
    if (idx >= 0) return idx;
  }

  const idxHeader = documentos.findIndex((d) => String(d.id ?? '') === String(atendimento.documentoId ?? ''));
  if (idxHeader >= 0) return idxHeader;

  const numHeader = normalizarNumeroDocumento(atendimento.documentoNumero);
  if (numHeader) {
    return indiceDocumentoPorNumero(documentos, numHeader);
  }

  return -1;
}

export function encontrarLinhaDocumentoParaItemEstorno(
  documento: DocumentoStoredEstorno,
  item: AtendimentoItem,
): DocumentoStoredEstorno['itens'][number] | undefined {
  const itens = documento.itens ?? [];
  const docItemId = String(item.documentoItemId ?? '').trim();
  if (docItemId) {
    const byId = itens.find((it) => String(it.id) === docItemId);
    if (byId) return byId;
  }
  const cod = codigoMaterialKey(item.codigoMaterial);
  if (!cod) return undefined;
  return itens.find((it) => codigoMaterialKey(String(it.codigoMaterial ?? '')) === cod);
}

export function atendimentoTemVariosDocumentos(at: Atendimento, itensRef?: AtendimentoItem[]): boolean {
  const itens = itensRef ?? at.itens;
  const nums = new Set(
    itens.map((it) => normalizarNumeroDocumento(it.documentoNumero)).filter((n) => n && n !== '-'),
  );
  return nums.size > 1 || at.documentoNumero === 'MULTIPLOS';
}

export function numerosDocumentosDistintosItens(itens: AtendimentoItem[]): string[] {
  return [
    ...new Set(
      itens.map((it) => normalizarNumeroDocumento(it.documentoNumero)).filter((n) => n && n !== '-' && n !== 'MULTIPLOS'),
    ),
  ];
}
