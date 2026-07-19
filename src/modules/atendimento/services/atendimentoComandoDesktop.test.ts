import { describe, expect, it } from 'vitest';

import {
  buildDesktopAtendimentoPatchDelta,
  deltaAtendimentoTemConteudoComando,
} from './atendimentoSnapshotPatch';
import { buildDesktopAtendimentoIdempotencyKey } from './atendimentoComandoDesktop';
import { resumoConfirmacaoLoteNuvem } from './atendimentoReconciliacaoDesktop';

describe('atendimentoSnapshotPatch / buildDesktopAtendimentoPatchDelta', () => {
  it('envia apenas documentos alterados e linhas novas de historico no comando', () => {
    const baseline = {
      documentos: [
        {
          id: 'd1',
          numero: 'DOC-1',
          itens: [{ id: 'i1', quantidadeAtendida: 0 }],
        },
      ],
      atendimentos: [],
      atendimentoHistorico: [],
    };
    const next = {
      documentos: [
        {
          id: 'd1',
          numero: 'DOC-1',
          itens: [{ id: 'i1', quantidadeAtendida: 2 }],
        },
      ],
      atendimentos: [{ id: 'a1', numero: 'ATD-00001' }],
      atendimentoHistorico: [{ id: 'h1', loteNumero: 'ATD-00001' }],
      dataAtualizacao: '2026-07-06T00:00:00.000Z',
    };

    const delta = buildDesktopAtendimentoPatchDelta(baseline, next);
    expect(delta.comandoPatch.documentos).toHaveLength(1);
    expect(delta.comandoPatch.atendimentoHistorico).toHaveLength(1);
    expect(delta.comandoPatch.atendimentos).toHaveLength(1);
    expect(delta.patch.atendimentos).toHaveLength(1);
    expect(deltaAtendimentoTemConteudoComando(delta.comandoPatch)).toBe(true);
  });

  it('nao inclui historico ja existente no delta', () => {
    const baseline = {
      atendimentoHistorico: [{ id: 'h1', loteNumero: 'ATD-00001' }],
      atendimentos: [{ id: 'a1', numero: 'ATD-00001' }],
    };
    const next = {
      atendimentoHistorico: [{ id: 'h1', loteNumero: 'ATD-00001' }],
      atendimentos: [{ id: 'a1', numero: 'ATD-00001', status: 'concluido' }],
    };

    const delta = buildDesktopAtendimentoPatchDelta(baseline, next);
    expect(delta.comandoPatch.atendimentoHistorico).toBeUndefined();
    expect(delta.comandoPatch.atendimentos).toHaveLength(1);
    expect(delta.patch.atendimentos).toHaveLength(1);
  });

  it('envia historico novo no comando mas nunca no fallback sem merge', () => {
    const baseline = {
      atendimentoHistorico: [],
      atendimentos: [],
    };
    const next = {
      atendimentoHistorico: [{ id: 'h-new', loteNumero: 'ATD-00099' }],
      atendimentos: [{ id: 'a99', numero: 'ATD-00099' }],
      dataAtualizacao: '2026-07-19T00:00:00.000Z',
    };

    const delta = buildDesktopAtendimentoPatchDelta(baseline, next);
    expect(delta.comandoPatch.atendimentoHistorico).toHaveLength(1);
    expect(delta.patch.atendimentoHistorico).toHaveLength(1);
    expect(delta.patchWithoutMerge.atendimentoHistorico).toBeUndefined();
    expect(delta.patchWithoutMerge.atendimentos).toBeUndefined();
  });
});

describe('atendimentoComandoDesktop / buildDesktopAtendimentoIdempotencyKey', () => {
  it('gera chave estavel para um atendimento', () => {
    expect(
      buildDesktopAtendimentoIdempotencyKey({
        atendimentos: [{ id: 'uuid-1', numero: 'ATD-00099' }],
      }),
    ).toBe('pc-at-uuid-1-ATD-00099');
  });

  it('gera chave para estorno', () => {
    expect(
      buildDesktopAtendimentoIdempotencyKey({
        estornoLogIds: ['e1', 'e2'],
      }),
    ).toBe('pc-est-e1-e2');
  });
});

describe('atendimentoReconciliacaoDesktop / resumoConfirmacaoLoteNuvem', () => {
  it('identifica lote em dia', () => {
    const resumo = resumoConfirmacaoLoteNuvem(
      [{ loteNumero: 'ATD-00001' }, { loteNumero: 'ATD-00001' }],
      'ATD-00001',
      2,
    );
    expect(resumo.emDia).toBe(true);
    expect(resumo.faltam).toBe(0);
  });

  it('identifica itens em falta', () => {
    const resumo = resumoConfirmacaoLoteNuvem([{ loteNumero: 'ATD-00001' }], 'ATD-00001', 3);
    expect(resumo.emDia).toBe(false);
    expect(resumo.faltam).toBe(2);
  });
});
