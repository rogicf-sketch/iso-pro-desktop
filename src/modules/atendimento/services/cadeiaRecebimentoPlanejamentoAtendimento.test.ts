/**
 * Cadeia operacional (nao quebrar em actualizacoes):
 * Recebimento (NF conferida/direto) → saldo no Planejamento → Atendimento so com saldo.
 * Pendente no planejamento = sem estoque = atendimento bloqueado.
 */
import { describe, expect, it } from 'vitest';
import {
  montarMetricasPorCodigoMaterial,
  resolverStatusDocumentoPlanejamento,
  resolverStatusLinhaDocumento,
} from '../../documentos/services/documentoPlanejamento';
import type { Documento } from '../../documentos/types/documento.types';
import type { Recebimento, RecebimentoItem } from '../../recebimentos/types/recebimento.types';
import { situacaoSaldoAtendimento } from '../components/AtendimentoItensTable';
import { quantidadeMaximaAtendimentoLinha } from '../hooks/useAtendimento';
import type { AtendimentoDocumentoLinha } from '../types/atendimento.types';

function docLinha(codigo: string, qtd: number, atendida = 0): Documento {
  return {
    id: 'd1',
    numero: 'DOC-CADEIA',
    revisao: 'A',
    descricao: 'Cadeia',
    responsavel: 'R',
    dataDocumento: '2026-01-01',
    status: 'pendente',
    observacao: '',
    itens: [
      {
        id: 'i1',
        codigoMaterial: codigo,
        descricaoMaterial: 'Mat',
        unidade: 'UN',
        quantidadeProjeto: qtd,
        quantidadeAtendida: atendida,
        localizacao: '',
      },
    ],
  };
}

function nfConferida(codigo: string, qtd: number): Recebimento {
  const item: RecebimentoItem = {
    id: 'ri1',
    codigoMaterial: codigo,
    descricaoMaterial: 'Mat',
    unidade: 'UN',
    disciplina: '',
    quantidadeRecebida: qtd,
    quantidadeConferida: qtd,
    localizacao: 'A-1',
    pesoUnitario: 0,
    pesoTotal: 0,
  };
  return {
    id: 'nf1',
    fornecedor: 'Forn',
    dataRecebimento: '2026-01-01',
    notaFiscal: 'NF-1',
    romaneio: 'ROM-1',
    conferente: 'Conf',
    status: 'conferido',
    modoRecebimento: 'aguardando_conferencia',
    observacoes: '',
    itens: [item],
  };
}

function linhaAtendimento(pendente: number, saldo: number): AtendimentoDocumentoLinha {
  return {
    documentoItemId: 'i1',
    materialId: null,
    codigoMaterial: 'MAT-1',
    descricaoMaterial: 'Mat',
    unidade: 'UN',
    quantidadeProjeto: pendente,
    quantidadeAtendida: 0,
    quantidadePendente: pendente,
    saldoDisponivel: saldo,
    quantidadeNestaOperacao: 0,
  };
}

describe('cadeia recebimento → planejamento → atendimento', () => {
  it('sem NF: planejamento Pendente e atendimento Sem saldo / qty 0', () => {
    const doc = docLinha('MAT-1', 10);
    const metricas = montarMetricasPorCodigoMaterial([doc], []);
    expect(resolverStatusLinhaDocumento(doc.itens[0]!, metricas)).toBe('pendente');
    expect(resolverStatusDocumentoPlanejamento(doc, metricas)).toBe('pendente');

    const saldo = Math.max(0, (metricas.get('mat-1')?.recebido ?? 0) - (metricas.get('mat-1')?.atendido ?? 0));
    expect(saldo).toBe(0);
    expect(situacaoSaldoAtendimento(saldo, 10)).toEqual({ text: 'Sem saldo', tone: 'danger' });
    expect(quantidadeMaximaAtendimentoLinha(linhaAtendimento(10, saldo))).toBe(0);
  });

  it('com NF conferida que cobre o desenho: Recebido e Pode atender', () => {
    const doc = docLinha('MAT-1', 10);
    const metricas = montarMetricasPorCodigoMaterial([doc], [nfConferida('MAT-1', 10)]);
    expect(resolverStatusLinhaDocumento(doc.itens[0]!, metricas)).toBe('recebido');
    expect(resolverStatusDocumentoPlanejamento(doc, metricas)).toBe('recebido');

    const saldo = Math.max(0, (metricas.get('mat-1')?.recebido ?? 0) - (metricas.get('mat-1')?.atendido ?? 0));
    expect(saldo).toBe(10);
    expect(situacaoSaldoAtendimento(saldo, 10)).toEqual({ text: 'Pode atender', tone: 'ok' });
    expect(quantidadeMaximaAtendimentoLinha(linhaAtendimento(10, saldo))).toBe(10);
  });

  it('NF parcial: planejamento Parcial e atendimento so ate o saldo', () => {
    const doc = docLinha('MAT-1', 10);
    const metricas = montarMetricasPorCodigoMaterial([doc], [nfConferida('MAT-1', 4)]);
    expect(resolverStatusLinhaDocumento(doc.itens[0]!, metricas)).toBe('parcial');
    expect(resolverStatusDocumentoPlanejamento(doc, metricas)).toBe('parcial');

    const saldo = Math.max(0, (metricas.get('mat-1')?.recebido ?? 0) - (metricas.get('mat-1')?.atendido ?? 0));
    expect(saldo).toBe(4);
    expect(situacaoSaldoAtendimento(saldo, 10).text).toBe('Saldo parcial');
    expect(quantidadeMaximaAtendimentoLinha(linhaAtendimento(10, saldo))).toBe(4);
  });

  it('nunca inventa atendimento com qty = pendente quando saldo e 0', () => {
    expect(quantidadeMaximaAtendimentoLinha(linhaAtendimento(3.593, 0))).toBe(0);
    expect(quantidadeMaximaAtendimentoLinha(linhaAtendimento(3.593, 3.593))).toBe(3.593);
  });
});
