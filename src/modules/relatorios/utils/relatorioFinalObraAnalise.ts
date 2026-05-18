import type { Atendimento } from '../../atendimento/types/atendimento.types';
import type { RelatorioFinalObraDados } from '../types/relatorioFinalObra.types';

/** Acima deste total, o PDF não lista tudo — só resumo + destaques + amostra. */
export const RFO_LIMITE_LISTA_COMPLETA_PDF = 40;

/** Quantidade máxima de linhas na amostra «últimos registros» por módulo. */
export const RFO_LIMITE_AMOSTRA_RECENTE = 15;

/** Teto de linhas na secção «Destaques» (evita PDF gigante se muitos RNC). */
export const RFO_LIMITE_DESTAQUES = 120;

export type DestaqueSeveridade = 'critico' | 'atencao' | 'info';

export type DestaqueRelatorioFinalObra = {
  dataIso: string;
  modulo: string;
  referencia: string;
  motivo: string;
  severidade: DestaqueSeveridade;
};

export type ResumoStatusModulo = {
  modulo: string;
  linhas: Array<{ rotulo: string; quantidade: number; percentual: number }>;
  total: number;
};

export type AnaliseRelatorioFinalObra = {
  destaques: DestaqueRelatorioFinalObra[];
  resumosStatus: ResumoStatusModulo[];
  usarModoResumido: boolean;
};

function pct(parte: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((parte / total) * 1000) / 10;
}

function contarPorChave<T>(items: T[], chave: (item: T) => string, rotulos: Record<string, string>): ResumoStatusModulo['linhas'] {
  const map = new Map<string, number>();
  for (const item of items) {
    const k = chave(item);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  const total = items.length;
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, q]) => ({
      rotulo: rotulos[k] ?? k,
      quantidade: q,
      percentual: pct(q, total),
    }));
}

function pushDestaque(
  out: DestaqueRelatorioFinalObra[],
  p: Omit<DestaqueRelatorioFinalObra, 'dataIso'> & { dataIso: string },
): void {
  out.push(p);
}

export function analisarRelatorioFinalObra(dados: RelatorioFinalObraDados): AnaliseRelatorioFinalObra {
  const destaques: DestaqueRelatorioFinalObra[] = [];

  const totalRegistros =
    dados.documentos.length +
    dados.recebimentos.length +
    dados.rir.length +
    dados.rnc.length +
    dados.atendimentos.length +
    dados.inventarios.length;

  const usarModoResumido = totalRegistros > RFO_LIMITE_LISTA_COMPLETA_PDF;

  for (const d of dados.documentos) {
    if (d.status === 'cancelado') {
      pushDestaque(destaques, {
        dataIso: d.dataDocumento,
        modulo: 'Planejamento',
        referencia: d.numero,
        motivo: 'Documento cancelado',
        severidade: 'critico',
      });
    } else if (d.status === 'pendente' || d.status === 'parcial') {
      pushDestaque(destaques, {
        dataIso: d.dataDocumento,
        modulo: 'Planejamento',
        referencia: d.numero,
        motivo: d.status === 'pendente' ? 'Planejamento pendente de atendimento' : 'Atendimento parcial do planejamento',
        severidade: 'atencao',
      });
    }
  }

  for (const r of dados.recebimentos) {
    if (r.status === 'cancelado') {
      pushDestaque(destaques, {
        dataIso: r.dataRecebimento,
        modulo: 'Recebimentos',
        referencia: r.notaFiscal || r.id,
        motivo: 'Recebimento cancelado',
        severidade: 'critico',
      });
    } else if (r.status === 'divergente' || r.conferenciaItensDivergentes > 0) {
      pushDestaque(destaques, {
        dataIso: r.dataRecebimento,
        modulo: 'Recebimentos',
        referencia: r.notaFiscal || r.id,
        motivo:
          r.status === 'divergente'
            ? 'Recebimento com status divergente'
            : `${r.conferenciaItensDivergentes} item(ns) com divergência na conferência`,
        severidade: 'critico',
      });
    } else if (r.status === 'aguardando_conferencia' || r.status === 'parcialmente_conferido') {
      pushDestaque(destaques, {
        dataIso: r.dataRecebimento,
        modulo: 'Recebimentos',
        referencia: r.notaFiscal || r.id,
        motivo: r.status === 'aguardando_conferencia' ? 'Aguardando conferência' : 'Conferência parcial',
        severidade: 'atencao',
      });
    }
  }

  for (const r of dados.rir) {
    if (r.status === 'cancelado') {
      pushDestaque(destaques, {
        dataIso: r.dataRegistro,
        modulo: 'RIR',
        referencia: r.codigo,
        motivo: 'RIR cancelado',
        severidade: 'critico',
      });
    } else if (r.laudo === 'reprovado') {
      pushDestaque(destaques, {
        dataIso: r.dataRegistro,
        modulo: 'RIR',
        referencia: r.codigo,
        motivo: 'Laudo reprovado na inspeção de recebimento',
        severidade: 'critico',
      });
    } else if (r.laudo === 'observacoes' || r.status === 'aberto' || r.status === 'em_analise') {
      pushDestaque(destaques, {
        dataIso: r.dataRegistro,
        modulo: 'RIR',
        referencia: r.codigo,
        motivo:
          r.laudo === 'observacoes'
            ? 'RIR com observações no laudo'
            : r.status === 'aberto'
              ? 'RIR em aberto'
              : 'RIR em análise',
        severidade: 'atencao',
      });
    }
  }

  for (const r of dados.rnc) {
    if (r.status === 'cancelado') {
      pushDestaque(destaques, {
        dataIso: r.dataRegistro,
        modulo: 'RNC',
        referencia: r.codigo,
        motivo: 'RNC cancelado (histórico)',
        severidade: 'info',
      });
    } else {
      pushDestaque(destaques, {
        dataIso: r.dataRegistro,
        modulo: 'RNC',
        referencia: r.codigo,
        motivo:
          r.status === 'concluido'
            ? `Não conformidade concluída — ${r.descricao.slice(0, 80)}`
            : r.status === 'em_tratativa'
              ? `Não conformidade em tratativa — ${r.descricao.slice(0, 80)}`
              : `Não conformidade em aberto — ${r.descricao.slice(0, 80)}`,
        severidade: r.status === 'concluido' ? 'info' : 'critico',
      });
    }
  }

  for (const a of dados.atendimentos) {
    if (a.status === 'estornado') {
      pushDestaque(destaques, {
        dataIso: a.dataAtendimento,
        modulo: 'Atendimento',
        referencia: a.numero,
        motivo: `Atendimento estornado · doc. ${a.documentoNumero}`,
        severidade: 'critico',
      });
    }
  }

  for (const i of dados.inventarios) {
    if (i.status === 'cancelado') {
      pushDestaque(destaques, {
        dataIso: i.dataInventario,
        modulo: 'Inventário',
        referencia: i.codigo,
        motivo: 'Inventário cancelado',
        severidade: 'critico',
      });
    } else if (i.status === 'aberto') {
      pushDestaque(destaques, {
        dataIso: i.dataInventario,
        modulo: 'Inventário',
        referencia: i.codigo,
        motivo: 'Inventário ainda aberto no encerramento',
        severidade: 'atencao',
      });
    } else if (i.divergencias > 0) {
      pushDestaque(destaques, {
        dataIso: i.dataInventario,
        modulo: 'Inventário',
        referencia: i.codigo,
        motivo: `${i.divergencias} divergência(s) de contagem`,
        severidade: 'atencao',
      });
    }
  }

  destaques.sort((a, b) => b.dataIso.localeCompare(a.dataIso));

  const resumosStatus: ResumoStatusModulo[] = [
    {
      modulo: 'Planejamento',
      total: dados.documentos.length,
      linhas: contarPorChave(
        dados.documentos,
        (d) => d.status,
        {
          pendente: 'Pendente',
          parcial: 'Parcial',
          recebido: 'Recebido',
          atendido: 'Atendido',
          cancelado: 'Cancelado',
        },
      ),
    },
    {
      modulo: 'Recebimentos',
      total: dados.recebimentos.length,
      linhas: contarPorChave(
        dados.recebimentos,
        (r) => r.status,
        {
          rascunho: 'Rascunho',
          aguardando_conferencia: 'Aguardando conferência',
          conferido: 'Conferido',
          parcialmente_conferido: 'Parcialmente conferido',
          divergente: 'Divergente',
          cancelado: 'Cancelado',
        },
      ),
    },
    {
      modulo: 'RIR',
      total: dados.rir.length,
      linhas: contarPorChave(
        dados.rir,
        (r) => r.status,
        {
          aberto: 'Aberto',
          em_analise: 'Em análise',
          tratado: 'Tratado',
          cancelado: 'Cancelado',
        },
      ),
    },
    {
      modulo: 'RNC',
      total: dados.rnc.length,
      linhas: contarPorChave(
        dados.rnc,
        (r) => r.status,
        {
          aberto: 'Aberto',
          em_tratativa: 'Em tratativa',
          concluido: 'Concluído',
          cancelado: 'Cancelado',
        },
      ),
    },
    {
      modulo: 'Atendimentos',
      total: dados.atendimentos.length,
      linhas: contarPorChave(
        dados.atendimentos,
        (a) => a.status,
        { concluido: 'Concluído', estornado: 'Estornado' },
      ),
    },
    {
      modulo: 'Inventários',
      total: dados.inventarios.length,
      linhas: contarPorChave(
        dados.inventarios,
        (i) => i.status,
        { aberto: 'Aberto', fechado: 'Fechado', cancelado: 'Cancelado' },
      ),
    },
  ];

  return {
    destaques: destaques.slice(0, RFO_LIMITE_DESTAQUES),
    resumosStatus,
    usarModoResumido,
  };
}

/** Últimos N registros por data (ISO descendente). */
export function amostraRecente<T>(items: T[], dataDe: (item: T) => string, limite = RFO_LIMITE_AMOSTRA_RECENTE): T[] {
  return [...items].sort((a, b) => dataDe(b).localeCompare(dataDe(a))).slice(0, limite);
}

export function totaisAtendimentoPorOrigem(atendimentos: Atendimento[]): Array<{ rotulo: string; quantidade: number }> {
  let windows = 0;
  let mobile = 0;
  for (const a of atendimentos) {
    if (a.origem === 'mobile') mobile += 1;
    else windows += 1;
  }
  const total = atendimentos.length;
  if (total === 0) return [];
  return [
    { rotulo: 'Desktop', quantidade: windows },
    { rotulo: 'Mobile', quantidade: mobile },
  ];
}
