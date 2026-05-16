import { describe, expect, it } from 'vitest';
import type { Recebimento, RecebimentoItem } from '../../recebimentos/types/recebimento.types';
import type { Documento } from '../types/documento.types';
import type { DocumentoItem } from '../types/documento.types';
import {
  montarLocalizacoesPorCodigoMaterial,
  montarMetricasPorCodigoMaterial,
  quantidadeAtingeOuSuperaPlanejamento,
  resolverLocalizacaoExibicaoPlanejamento,
  resolverStatusDocumentoPlanejamento,
  resolverStatusLinhaDocumento,
} from './documentoPlanejamento';

function itemLinha(partial: Partial<RecebimentoItem> & Pick<RecebimentoItem, 'codigoMaterial' | 'localizacao'>): RecebimentoItem {
  return {
    id: partial.id ?? 'i',
    codigoMaterial: partial.codigoMaterial,
    descricaoMaterial: partial.descricaoMaterial ?? 'D',
    unidade: partial.unidade ?? 'PC',
    disciplina: partial.disciplina ?? 'T',
    localizacao: partial.localizacao,
    quantidadeRecebida: partial.quantidadeRecebida ?? 1,
    quantidadeConferida: partial.quantidadeConferida ?? 1,
    pesoUnitario: partial.pesoUnitario ?? 0,
    pesoTotal: partial.pesoTotal ?? 0,
    certificado: partial.certificado,
  };
}

function recebimentoBase(over: Partial<Recebimento> & { itens: RecebimentoItem[] }): Recebimento {
  return {
    id: over.id ?? 'rec',
    fornecedor: over.fornecedor ?? 'Forn',
    dataRecebimento: over.dataRecebimento ?? '2026-01-01',
    notaFiscal: over.notaFiscal ?? 'NF-1',
    romaneio: over.romaneio ?? 'ROM-1',
    conferente: over.conferente ?? 'Conf',
    modoRecebimento: over.modoRecebimento ?? 'direto',
    status: over.status ?? 'conferido',
    observacoes: over.observacoes ?? '',
    itens: over.itens,
  };
}

describe('montarLocalizacoesPorCodigoMaterial', () => {
  it('junta localizacoes distintas do mesmo codigo em varios recebimentos', () => {
    const recebimentos: Recebimento[] = [
      recebimentoBase({
        id: 'a',
        notaFiscal: 'NF-742197',
        itens: [itemLinha({ id: '1', codigoMaterial: '  COD-X ', localizacao: 'PÁTIO EXT' })],
      }),
      recebimentoBase({
        id: 'b',
        notaFiscal: 'NF-702156',
        itens: [itemLinha({ id: '2', codigoMaterial: 'COD-X', localizacao: 'GALPÃO-2' })],
      }),
    ];
    const map = montarLocalizacoesPorCodigoMaterial(recebimentos);
    expect(map.get('cod-x')).toBe('GALPÃO-2 | PÁTIO EXT');
  });

  it('nao duplica a mesma localizacao em varias linhas ou notas', () => {
    const recebimentos: Recebimento[] = [
      recebimentoBase({
        id: 'a',
        itens: [itemLinha({ id: '1', codigoMaterial: 'Z', localizacao: 'PÁTIO EXT' })],
      }),
      recebimentoBase({
        id: 'b',
        itens: [itemLinha({ id: '2', codigoMaterial: 'Z', localizacao: 'PÁTIO EXT' })],
      }),
    ];
    const map = montarLocalizacoesPorCodigoMaterial(recebimentos);
    expect(map.get('z')).toBe('PÁTIO EXT');
  });

  it('ignora recebimento cancelado ou rascunho', () => {
    const recebimentos: Recebimento[] = [
      recebimentoBase({ id: 'ok', status: 'conferido', itens: [itemLinha({ codigoMaterial: 'A', localizacao: 'L1' })] }),
      recebimentoBase({
        id: 'canc',
        status: 'cancelado',
        itens: [itemLinha({ codigoMaterial: 'A', localizacao: 'IGNORAR' })],
      }),
      recebimentoBase({
        id: 'ras',
        status: 'rascunho',
        itens: [itemLinha({ codigoMaterial: 'B', localizacao: 'RAS' })],
      }),
    ];
    const map = montarLocalizacoesPorCodigoMaterial(recebimentos);
    expect(map.get('a')).toBe('L1');
    expect(map.has('b')).toBe(false);
  });
});

describe('resolverLocalizacaoExibicaoPlanejamento', () => {
  it('prioriza mapa de recebimentos e cai no texto do documento se vazio', () => {
    const locMap = new Map<string, string>([['cod', 'Depósito 1']]);
    const comReceb: DocumentoItem = {
      id: '1',
      codigoMaterial: 'COD',
      descricaoMaterial: 'x',
      unidade: 'PC',
      quantidadeProjeto: 1,
      quantidadeAtendida: 0,
      localizacao: 'Manual',
    };
    expect(resolverLocalizacaoExibicaoPlanejamento(comReceb, locMap)).toBe('Depósito 1');

    const semReceb: DocumentoItem = { ...comReceb, codigoMaterial: 'OUTRO' };
    expect(resolverLocalizacaoExibicaoPlanejamento(semReceb, locMap)).toBe('Manual');

    expect(resolverLocalizacaoExibicaoPlanejamento(semReceb, undefined)).toBe('Manual');
  });
});

function documentoBase(over: Partial<Documento> & Pick<Documento, 'numero' | 'itens'>): Documento {
  return {
    id: over.id ?? 'doc-1',
    numero: over.numero,
    revisao: over.revisao ?? 'A',
    descricao: over.descricao ?? 'Descricao',
    responsavel: over.responsavel ?? 'Resp',
    dataDocumento: over.dataDocumento ?? '2026-04-22',
    observacao: '',
    status: over.status ?? 'pendente',
    itens: over.itens,
  };
}

describe('quantidadeAtingeOuSuperaPlanejamento / floats', () => {
  it('trata como coberto quando totais coincidem em decimal mas a soma float acumula erro', () => {
    const cod = 'tubc-tubo-caso-real';
    const doc = documentoBase({
      numero: 'MESMO-COD-VARIAS-LINHAS',
      itens: [
        {
          id: '1',
          codigoMaterial: cod,
          descricaoMaterial: 'Tubo',
          unidade: 'M',
          quantidadeProjeto: 312,
          quantidadeAtendida: 0,
          localizacao: '',
        },
        {
          id: '2',
          codigoMaterial: cod,
          descricaoMaterial: 'Tubo',
          unidade: 'M',
          quantidadeProjeto: 7.8,
          quantidadeAtendida: 0,
          localizacao: '',
        },
        {
          id: '3',
          codigoMaterial: cod,
          descricaoMaterial: 'Tubo',
          unidade: 'M',
          quantidadeProjeto: 7.5,
          quantidadeAtendida: 0,
          localizacao: '',
        },
        {
          id: '4',
          codigoMaterial: cod,
          descricaoMaterial: 'Tubo',
          unidade: 'M',
          quantidadeProjeto: 3.1,
          quantidadeAtendida: 0,
          localizacao: '',
        },
      ],
    });

    const recebimentos = [
      recebimentoBase({
        id: 'r-large',
        itens: [
          itemLinha({
            id: 'a',
            codigoMaterial: cod,
            quantidadeRecebida: 312,
            quantidadeConferida: 312,
            localizacao: 'HA-01',
          }),
        ],
      }),
      recebimentoBase({
        id: 'r-small',
        itens: [
          itemLinha({
            id: 'b',
            codigoMaterial: cod,
            quantidadeRecebida: 18.4,
            quantidadeConferida: 18.4,
            localizacao: 'MJ-03',
          }),
        ],
      }),
    ];

    const metricas = montarMetricasPorCodigoMaterial([doc], recebimentos);
    const m = metricas.get(cod);
    expect(m).toBeDefined();
    /** Soma incremental do planejamento vs soma das notas — sem tolerança falharia aqui em JS */
    expect(m!.recebido < m!.prevista).toBe(true);
    expect(quantidadeAtingeOuSuperaPlanejamento(m!.recebido, m!.prevista)).toBe(true);

    for (const lin of doc.itens) {
      expect(resolverStatusLinhaDocumento(lin, metricas)).toBe('recebido');
    }
    expect(resolverStatusDocumentoPlanejamento(doc, metricas)).toBe('recebido');
  });
});

describe('resolverStatusDocumentoPlanejamento', () => {
  it('documento recebido quando todas as linhas estao Recebido no planejamento', () => {
    const cod = 'tubo-compartilhado';
    const linha = (id: string, qProj: number): DocumentoItem => ({
      id,
      codigoMaterial: cod,
      descricaoMaterial: 'Tubo',
      unidade: 'M',
      quantidadeProjeto: qProj,
      quantidadeAtendida: 0,
      localizacao: '',
    });

    const doc = documentoBase({
      numero: 'BGB-DEMO',
      itens: [linha('a', 4), linha('b', 17)],
    });

    const recebimentos = [
      recebimentoBase({
        itens: [
          itemLinha({
            id: 'r1',
            codigoMaterial: cod,
            quantidadeRecebida: 21,
            quantidadeConferida: 21,
            localizacao: 'C-12',
          }),
        ],
      }),
    ];

    const metricas = montarMetricasPorCodigoMaterial([doc], recebimentos);
    expect(metricas.get(cod)?.prevista).toBe(21);
    expect(metricas.get(cod)?.recebido).toBe(21);

    for (const it of doc.itens) {
      expect(resolverStatusLinhaDocumento(it, metricas)).toBe('recebido');
    }
    expect(resolverStatusDocumentoPlanejamento(doc, metricas)).toBe('recebido');
  });

  it('documento atendido quando todas as linhas estao Atendido', () => {
    const cod = 'peca-y';
    const doc = documentoBase({
      numero: 'DOC-ATD',
      itens: [
        {
          id: '1',
          codigoMaterial: cod,
          descricaoMaterial: 'Peca',
          unidade: 'PC',
          quantidadeProjeto: 5,
          quantidadeAtendida: 5,
          localizacao: '',
        },
      ],
    });
    const metricas = montarMetricasPorCodigoMaterial([doc], []);
    expect(resolverStatusLinhaDocumento(doc.itens[0]!, metricas)).toBe('atendido');
    expect(resolverStatusDocumentoPlanejamento(doc, metricas)).toBe('atendido');
  });
});
