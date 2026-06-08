import type { Recebimento } from '../types/recebimento.types';

function normalizeLookupValue(value: string): string {
  return value.trim().toLowerCase();
}

/** Chave de negócio: fornecedor + NF + romaneio (mesma regra do import). */
export function chaveNegocioRecebimento(
  rec: Pick<Recebimento, 'fornecedor' | 'notaFiscal' | 'romaneio'>,
): string {
  return [
    normalizeLookupValue(rec.fornecedor),
    normalizeLookupValue(rec.notaFiscal),
    normalizeLookupValue(rec.romaneio),
  ].join('|');
}

function rankStatusRecebimento(status: Recebimento['status']): number {
  if (status === 'conferido') return 4;
  if (status === 'parcialmente_conferido' || status === 'divergente') return 3;
  if (status === 'aguardando_conferencia') return 2;
  if (status === 'rascunho') return 1;
  return 0;
}

/** Preferência em duplicatas: conferido > parcial > aguardando; depois data mais recente. */
export function recebimentoVenceConflitoChaveNegocio(a: Recebimento, b: Recebimento): boolean {
  const ra = rankStatusRecebimento(a.status);
  const rb = rankStatusRecebimento(b.status);
  if (ra !== rb) return ra > rb;

  const qa = a.itens.reduce((t, i) => t + Number(i.quantidadeConferida ?? 0), 0);
  const qb = b.itens.reduce((t, i) => t + Number(i.quantidadeConferida ?? 0), 0);
  if (qa !== qb) return qa > qb;

  const da = (a.dataConferencia || a.dataRecebimento || '').trim();
  const db = (b.dataConferencia || b.dataRecebimento || '').trim();
  if (da !== db) return da.localeCompare(db) > 0;

  return a.id.localeCompare(b.id) > 0;
}

/** Remove duplicatas legadas (mesma NF/romaneio/fornecedor) mantendo o registo mais atual. */
export function dedupeRecebimentosPorChaveNegocio(items: Recebimento[]): Recebimento[] {
  const byKey = new Map<string, Recebimento>();
  for (const rec of items) {
    const key = chaveNegocioRecebimento(rec);
    if (!key.replace(/\|/g, '').trim()) {
      byKey.set(`__id__:${rec.id}`, rec);
      continue;
    }
    const prev = byKey.get(key);
    if (!prev || recebimentoVenceConflitoChaveNegocio(rec, prev)) {
      byKey.set(key, rec);
    }
  }
  return Array.from(byKey.values());
}
