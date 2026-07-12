import { readIsoProSnapshotSlices } from '../../../lib/isoProSnapshot';
import { waitForAtendimentoSyncIdle } from './atendimentoComandoDesktop';

const RECONCILE_MAX_ROUNDS = 6;

export type ReconciliacaoAtendimentoDesktopResult = {
  ok: boolean;
  itensEsperados: number;
  itensNuvem: number;
  tentativas: number;
  error?: string;
};

function contarHistoricoLote(
  historico: Array<{ loteNumero?: unknown }> | undefined,
  loteNumero: string,
): number {
  const alvo = String(loteNumero).trim();
  return (historico ?? []).filter((h) => String(h.loteNumero ?? '').trim() === alvo).length;
}

/**
 * Confirma que todas as linhas de histórico de um lote chegaram à nuvem após gravação PC.
 */
export async function reconciliarLoteAtendimentoNaNuvem(input: {
  loteNumero: string;
  itensEsperados: number;
}): Promise<ReconciliacaoAtendimentoDesktopResult> {
  const itensEsperados = Math.max(0, input.itensEsperados);
  if (itensEsperados === 0) {
    return { ok: true, itensEsperados: 0, itensNuvem: 0, tentativas: 0 };
  }

  let lastItensNuvem = 0;
  let lastError: string | undefined;

  for (let round = 0; round < RECONCILE_MAX_ROUNDS; round++) {
    await waitForAtendimentoSyncIdle();

    const slices = await readIsoProSnapshotSlices<{ atendimentoHistorico?: Array<{ loteNumero?: unknown }> }>(
      ['atendimentoHistorico'],
      { bypassCache: true },
    );
    lastItensNuvem = contarHistoricoLote(slices.atendimentoHistorico, input.loteNumero);

    if (lastItensNuvem >= itensEsperados) {
      return {
        ok: true,
        itensEsperados,
        itensNuvem: lastItensNuvem,
        tentativas: round + 1,
      };
    }

    lastError = `Faltam ${itensEsperados - lastItensNuvem} item(ns) na nuvem para ${input.loteNumero}.`;
    await new Promise((r) => setTimeout(r, 400));
  }

  return {
    ok: false,
    itensEsperados,
    itensNuvem: lastItensNuvem,
    tentativas: RECONCILE_MAX_ROUNDS,
    error: lastError,
  };
}

export function resumoConfirmacaoLoteNuvem(
  historico: Array<{ loteNumero?: unknown }> | undefined,
  loteNumero: string,
  itensEsperados: number,
): { itensEsperados: number; itensNuvem: number; emDia: boolean; faltam: number } {
  const itensNuvem = contarHistoricoLote(historico, loteNumero);
  return {
    itensEsperados,
    itensNuvem,
    emDia: itensNuvem >= itensEsperados,
    faltam: Math.max(0, itensEsperados - itensNuvem),
  };
}
