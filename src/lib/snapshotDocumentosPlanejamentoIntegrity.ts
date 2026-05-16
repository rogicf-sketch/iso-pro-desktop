/**
 * Integridade entre `documentos` e referencias em `atendimentos` / `atendimentoHistorico`
 * no payload do snapshot — evita substituir o planejamento por uma lista curta que deixa
 * historico de baixas a apontar para desenhos inexistentes (caso real visto em producao).
 */

export type DocumentoPlanejamentoMinimo = { id: string; numero: string };

export type PayloadComRefsAtendimento = Record<string, unknown> & {
  documentos?: unknown;
  atendimentoHistorico?: unknown;
  atendimentos?: unknown;
};

function asObjArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is Record<string, unknown> => x != null && typeof x === 'object') as Record<string, unknown>[];
}

function coletarRefsAtendimentoDoPayload(payload: PayloadComRefsAtendimento): Array<{ id: string; num: string }> {
  const out: Array<{ id: string; num: string }> = [];

  for (const row of asObjArray(payload.atendimentoHistorico)) {
    const id = row.documentoId != null ? String(row.documentoId).trim() : '';
    const num = row.documento != null ? String(row.documento).trim().toLowerCase() : '';
    if (!id && !num) continue;
    out.push({ id, num });
  }

  for (const at of asObjArray(payload.atendimentos)) {
    const id = at.documentoId != null ? String(at.documentoId).trim() : '';
    const num = at.documentoNumero != null ? String(at.documentoNumero).trim().toLowerCase() : '';
    if (!id && !num) continue;
    out.push({ id, num });
  }

  return out;
}

function refCobertaPorDocumentos(ref: { id: string; num: string }, docs: DocumentoPlanejamentoMinimo[]): boolean {
  const ids = new Set(docs.map((d) => String(d.id ?? '').trim()).filter(Boolean));
  const nums = new Set(docs.map((d) => String(d.numero ?? '').trim().toLowerCase()).filter(Boolean));
  if (ref.id && ids.has(ref.id)) return true;
  if (ref.num && nums.has(ref.num)) return true;
  return false;
}

/**
 * Devolve mensagem de erro em portugues ou `null` se a gravacao pode prosseguir.
 * @param dispensarValidacao — exclusao definitiva ja validada por `listarDocumentosComAtendimentoVinculado`;
 *   ainda pode existir `atendimentoHistorico` legado; nesse fluxo a equipa aceita gravar sem este bloqueio.
 */
export function mensagemSePlanejamentoIncompativelComRefsAtendimento(
  payload: PayloadComRefsAtendimento,
  nextDocs: DocumentoPlanejamentoMinimo[],
  opcoes?: { dispensarValidacao?: boolean },
): string | null {
  if (opcoes?.dispensarValidacao) {
    return null;
  }

  const refs = coletarRefsAtendimentoDoPayload(payload);
  if (!refs.length) {
    return null;
  }

  const prevDocsRaw = asObjArray(payload.documentos);
  const prevDocs: DocumentoPlanejamentoMinimo[] = prevDocsRaw.map((d) => ({
    id: String(d.id ?? '').trim(),
    numero: String(d.numero ?? '').trim(),
  }));

  const uncovered = refs.filter((r) => !refCobertaPorDocumentos(r, nextDocs));
  if (!uncovered.length) {
    return null;
  }

  const introduzOrfaos = uncovered.some((r) => refCobertaPorDocumentos(r, prevDocs));

  const chave = (r: { id: string; num: string }) => (r.id ? `id:${r.id}` : r.num ? `n:${r.num}` : '');
  const keys = new Set(refs.map(chave).filter(Boolean));

  const amostra = [...new Set(uncovered.map(chave).filter(Boolean))].slice(0, 15).join(', ');

  if (introduzOrfaos) {
    return `Gravacao bloqueada: o planejamento a gravar nao cobre referencias de atendimento ja registadas na nuvem (ex.: documento ou id em atendimentos / atendimentoHistorico). Amostra de chaves em falta: ${amostra}. Use um PC com a lista completa, restaure um backup do snapshot, ou regularize o historico antes de substituir os desenhos.`;
  }

  if (nextDocs.length < keys.size) {
    return `Gravacao bloqueada: existem ${keys.size} referencia(s) distintas a documentos no historico de atendimento, mas o planejamento a gravar tem apenas ${nextDocs.length} desenho(s). Carregue a lista completa ou corrija o snapshot antes de gravar.`;
  }

  return `Gravacao bloqueada: referencias de atendimento na nuvem nao batem com o planejamento a gravar (amostra: ${amostra}). Corrija o snapshot, restaure backup, ou alinhe o planejamento completo antes de gravar.`;
}
