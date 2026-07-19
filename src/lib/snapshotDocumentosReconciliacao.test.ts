import { describe, expect, it } from 'vitest';

import {
  documentosReconciliadosDoPayload,
  type PayloadPlanejamentoReconcile,
} from './snapshotDocumentosReconciliacao';

/**
 * Regressao 18/07/2026: apos estorno, as linhas antigas de `atendimentoHistorico` ficam na nuvem
 * (RPC append-only) e a reconciliacao devolvia as quantidades estornadas ao planejamento.
 */
describe('reconciliacao de documentos com estornos', () => {
  const docBase = {
    id: 'doc-1',
    numero: 'E.RAZN010-IE6-00013-ABOVE SPDA',
    revisao: 'B',
    descricao: '',
    responsavel: '',
    status: 'pendente',
    itens: [
      {
        id: 'doc-1-item-1',
        codigo: 'ARLCPB0G',
        descricao: 'ARRUELA',
        unidade: 'PC',
        quantidade: 2,
        quantidadeAtendida: 0,
        localizacao: '',
      },
      {
        id: 'doc-1-item-2',
        codigo: 'ATER0003',
        descricao: 'BARRA CHATA',
        unidade: 'PC',
        quantidade: 51,
        quantidadeAtendida: 0,
        localizacao: '',
      },
    ],
  };

  const historicoLote = [
    {
      id: 'at-1-item-1',
      loteNumero: 'ATD-20260711-00080',
      documentoId: 'doc-1',
      documento: 'E.RAZN010-IE6-00013-ABOVE SPDA',
      codigo: 'ARLCPB0G',
      quantidade: 2,
    },
    {
      id: 'at-1-item-2',
      loteNumero: 'ATD-20260711-00080',
      documentoId: 'doc-1',
      documento: 'E.RAZN010-IE6-00013-ABOVE SPDA',
      codigo: 'ATER0003',
      quantidade: 51,
    },
  ];

  it('sem estorno, o historico continua a preencher quantidadeAtendida (comportamento actual)', () => {
    const payload: PayloadPlanejamentoReconcile = {
      documentos: [docBase],
      atendimentos: [{ numero: 'ATD-20260711-00080', status: 'concluido', itens: [] }],
      atendimentoHistorico: historicoLote,
    };
    const [doc] = documentosReconciliadosDoPayload(payload);
    expect(doc!.itens[0]!.quantidadeAtendida).toBe(2);
    expect(doc!.itens[1]!.quantidadeAtendida).toBe(51);
    expect(doc!.status).toBe('atendido');
  });

  it('fonte tables: nao eleva quantidadeAtendida com historico stale', () => {
    const payload: PayloadPlanejamentoReconcile = {
      _documentosSource: 'tables',
      documentos: [
        {
          ...docBase,
          itens: docBase.itens.map((it) => ({ ...it, quantidadeAtendida: 0 })),
        },
      ],
      atendimentos: [{ numero: 'ATD-20260711-00080', status: 'concluido', itens: [] }],
      atendimentoHistorico: historicoLote,
    };
    const [doc] = documentosReconciliadosDoPayload(payload);
    expect(doc!.itens[0]!.quantidadeAtendida).toBe(0);
    expect(doc!.itens[1]!.quantidadeAtendida).toBe(0);
  });

  it('estorno total: lote estornado nao ressuscita quantidades do historico', () => {
    const payload: PayloadPlanejamentoReconcile = {
      documentos: [docBase],
      atendimentos: [{ numero: 'ATD-20260711-00080', status: 'estornado', itens: [] }],
      atendimentoHistorico: historicoLote,
      atendimentoEstornoLog: [
        {
          loteNumero: 'ATD-20260711-00080',
          atendimentoItemId: 'at-1-item-1',
          documentoNumero: 'E.RAZN010-IE6-00013-ABOVE SPDA',
          codigoMaterial: 'ARLCPB0G',
          quantidadeEstornada: 2,
        },
        {
          loteNumero: 'ATD-20260711-00080',
          atendimentoItemId: 'at-1-item-2',
          documentoNumero: 'E.RAZN010-IE6-00013-ABOVE SPDA',
          codigoMaterial: 'ATER0003',
          quantidadeEstornada: 51,
        },
      ],
    };
    const [doc] = documentosReconciliadosDoPayload(payload);
    expect(doc!.itens[0]!.quantidadeAtendida).toBe(0);
    expect(doc!.itens[1]!.quantidadeAtendida).toBe(0);
    expect(doc!.status).toBe('pendente');
  });

  it('estorno parcial: abate apenas a quantidade estornada por doc+codigo', () => {
    const payload: PayloadPlanejamentoReconcile = {
      documentos: [docBase],
      atendimentos: [{ numero: 'ATD-20260711-00080', status: 'concluido', itens: [] }],
      atendimentoHistorico: historicoLote,
      atendimentoEstornoLog: [
        {
          loteNumero: 'ATD-20260711-00080',
          atendimentoItemId: 'at-1-item-2',
          documentoNumero: 'E.RAZN010-IE6-00013-ABOVE SPDA',
          codigoMaterial: 'ATER0003',
          quantidadeEstornada: 20,
        },
      ],
    };
    const [doc] = documentosReconciliadosDoPayload(payload);
    expect(doc!.itens[0]!.quantidadeAtendida).toBe(2);
    expect(doc!.itens[1]!.quantidadeAtendida).toBe(31);
    expect(doc!.status).toBe('parcial');
  });

  it('estorno de linhas mobile (por documentoItemId) tambem abate', () => {
    const payload: PayloadPlanejamentoReconcile = {
      documentos: [docBase],
      atendimentos: [{ numero: 'ATD-20260711-00081', status: 'concluido', itens: [] }],
      atendimentoHistorico: [
        {
          id: 'hist-mob-1',
          loteNumero: 'ATD-20260711-00081',
          documentoId: 'doc-1',
          documento: 'E.RAZN010-IE6-00013-ABOVE SPDA',
          documentoItemId: 'doc-1-item-2',
          codigo: 'ATER0003',
          quantidade: 40,
        },
      ],
      atendimentoEstornoLog: [
        {
          loteNumero: 'ATD-20260711-00081',
          atendimentoItemId: 'hist-mob-1',
          documentoNumero: 'E.RAZN010-IE6-00013-ABOVE SPDA',
          codigoMaterial: 'ATER0003',
          quantidadeEstornada: 15,
        },
      ],
    };
    const [doc] = documentosReconciliadosDoPayload(payload);
    expect(doc!.itens[1]!.quantidadeAtendida).toBe(25);
  });
});
