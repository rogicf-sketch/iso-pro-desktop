import type { Documento } from '../types/documento.types';

export type RevisaoActivaOutra = {
  id: string;
  numero: string;
  revisao: string;
  status: Documento['status'];
};

/**
 * Outras revisões activas (não canceladas) do mesmo número — exclui a revisão que se pretende manter
 * e opcionalmente o próprio documento (edição no mesmo id / subir revisão).
 */
export function listarRevisoesActivasOutrasDoNumero(
  documentos: Array<Pick<Documento, 'id' | 'numero' | 'revisao' | 'status'>>,
  numero: string,
  revisaoManter: string,
  excludeId?: string | null,
): RevisaoActivaOutra[] {
  const n = numero.trim().toLowerCase();
  const r = revisaoManter.trim().toLowerCase();
  if (!n) return [];

  return documentos
    .filter((d) => {
      if (d.status === 'cancelado') return false;
      if (excludeId && d.id === excludeId) return false;
      if (d.numero.trim().toLowerCase() !== n) return false;
      if (d.revisao.trim().toLowerCase() === r) return false;
      return true;
    })
    .map((d) => ({
      id: d.id,
      numero: d.numero,
      revisao: d.revisao,
      status: d.status,
    }))
    .sort(
      (a, b) =>
        a.numero.localeCompare(b.numero, 'pt-BR') || a.revisao.localeCompare(b.revisao, 'pt-BR'),
    );
}

/** Agrega revisões antigas activas para um conjunto de chaves (importação: vários docs no ficheiro). */
export function coletarRevisoesActivasOutrasParaChaves(
  existentes: Array<Pick<Documento, 'id' | 'numero' | 'revisao' | 'status'>>,
  chaves: Array<{ numero: string; revisao: string }>,
): RevisaoActivaOutra[] {
  const seen = new Set<string>();
  const out: RevisaoActivaOutra[] = [];
  for (const chave of chaves) {
    for (const old of listarRevisoesActivasOutrasDoNumero(existentes, chave.numero, chave.revisao)) {
      if (seen.has(old.id)) continue;
      seen.add(old.id);
      out.push(old);
    }
  }
  return out.sort(
    (a, b) =>
      a.numero.localeCompare(b.numero, 'pt-BR') || a.revisao.localeCompare(b.revisao, 'pt-BR'),
  );
}

export function motivoCancelamentoSubstituidoPorRevisao(numero: string, revisaoNova: string): string {
  return `Substituida pela revisao ${revisaoNova.trim()} do desenho ${numero.trim()} (mesmo numero).`;
}
