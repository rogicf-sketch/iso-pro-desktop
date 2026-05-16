import type { Atendimento } from '../types/atendimento.types';

/** Normaliza para comparacao (minusculas, sem acentos). */
function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function montarBlobBusca(item: Atendimento): string {
  const d = new Date(item.dataAtendimento);
  return [
    item.numero,
    item.documentoNumero,
    item.documentoId,
    item.atendente,
    item.atendenteMatricula,
    item.atendenteFuncao,
    item.recebedor,
    item.recebedorMatricula,
    item.recebedorFuncao,
    item.recebedorEmpresa,
    item.recebedorDocumento,
    item.autorizadorInterno,
    item.motivoRetirada,
    item.status,
    item.recebedorColaboradorId ?? '',
    d.toLocaleDateString('pt-BR'),
    d.toLocaleString('pt-BR'),
    ...item.itens.flatMap((i) => [i.codigoMaterial, i.descricaoMaterial, String(i.quantidadeAtendida), i.unidade]),
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Filtra lotes por texto livre: numero do atendimento, documento, pessoas, status, datas e materiais (codigo/descricao).
 * Varias palavras funcionam como E (todas devem aparecer em algum campo); texto inteiro tambem casa como substring.
 */
export function filtrarAtendimentosPorBusca(items: Atendimento[], rawQuery: string): Atendimento[] {
  const q = rawQuery.trim();
  if (!q) return items;

  const qFold = fold(q);
  const tokens = qFold.split(/\s+/).filter(Boolean);

  return items.filter((item) => {
    const blobFold = fold(montarBlobBusca(item));
    if (blobFold.includes(qFold)) return true;
    if (tokens.length === 0) return true;
    return tokens.every((t) => blobFold.includes(t));
  });
}
