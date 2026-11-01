import { describe, expect, it } from 'vitest';
import {
  coletarRevisoesActivasOutrasParaChaves,
  listarRevisoesActivasOutrasDoNumero,
  motivoCancelamentoSubstituidoPorRevisao,
} from './documentoRevisoesAntigas';

const docs = [
  { id: 'b', numero: 'E.RAZN-UNDER', revisao: 'B', status: 'pendente' as const },
  { id: 'd', numero: 'E.RAZN-UNDER', revisao: 'D', status: 'recebido' as const },
  { id: 'c', numero: 'E.RAZN-UNDER', revisao: 'C', status: 'cancelado' as const },
  { id: 'x', numero: 'OUTRO', revisao: 'A', status: 'pendente' as const },
];

describe('documentoRevisoesAntigas', () => {
  it('lista outras revisões activas do mesmo número', () => {
    const r = listarRevisoesActivasOutrasDoNumero(docs, 'E.RAZN-UNDER', 'D');
    expect(r.map((x) => x.revisao)).toEqual(['B']);
  });

  it('não inclui o próprio id ao editar (subir revisão no mesmo documento)', () => {
    const r = listarRevisoesActivasOutrasDoNumero(docs, 'E.RAZN-UNDER', 'D', 'b');
    // excluindo B: ao subir B→D no mesmo id, não há outra activa além de D
    expect(r).toEqual([]);
  });

  it('agrega por chaves de importação', () => {
    const r = coletarRevisoesActivasOutrasParaChaves(docs, [
      { numero: 'E.RAZN-UNDER', revisao: 'D' },
      { numero: 'OUTRO', revisao: 'B' },
    ]);
    expect(r.map((x) => `${x.numero}|${x.revisao}`)).toEqual(['E.RAZN-UNDER|B', 'OUTRO|A']);
  });

  it('motivo administrativo tem comprimento suficiente', () => {
    expect(motivoCancelamentoSubstituidoPorRevisao('DOC-1', 'D').length).toBeGreaterThanOrEqual(15);
  });
});
