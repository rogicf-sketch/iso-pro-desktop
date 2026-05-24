import { describe, expect, it } from 'vitest';
import type { AtendimentoDocumento } from '../types/atendimento.types';
import {
  adicionarOuAtualizarLinhaSessao,
  montarPayloadDocumentosSessao,
  obterErroRegistroSessaoRetirada,
} from './sessaoRetirada.utils';

function docBase(): AtendimentoDocumento {
  return {
    id: 'doc-a',
    numero: 'DES-A',
    revisao: 'A',
    descricao: 'Desc A',
    responsavel: 'Resp A',
    status: 'pendente',
    linhas: [
      {
        documentoItemId: 'item-a1',
        materialId: 'mat-1',
        codigoMaterial: 'M1',
        descricaoMaterial: 'Mat 1',
        unidade: 'UN',
        quantidadeProjeto: 10,
        quantidadeAtendida: 0,
        quantidadePendente: 10,
        saldoDisponivel: 100,
        quantidadeNestaOperacao: 0,
      },
    ],
  };
}

describe('sessaoRetirada.utils', () => {
  it('acumula quantidade na mesma linha da sessao', () => {
    const linha = {
      documentoId: 'doc-a',
      documentoNumero: 'DES-A',
      documentoRevisao: 'A',
      documentoDescricao: 'Desc',
      documentoResponsavel: 'R',
      documentoItemId: 'item-a1',
      codigoMaterial: 'M1',
      descricaoMaterial: 'Mat 1',
      unidade: 'UN',
      quantidade: 2,
    };
    const r1 = adicionarOuAtualizarLinhaSessao([], linha, 10);
    const r2 = adicionarOuAtualizarLinhaSessao(r1, { ...linha, quantidade: 3 }, 10);
    expect(r2).toHaveLength(1);
    expect(r2[0].quantidade).toBe(5);
  });

  it('monta payload agrupado por documento', () => {
    const payload = montarPayloadDocumentosSessao([
      {
        documentoId: 'doc-a',
        documentoNumero: 'A',
        documentoRevisao: '1',
        documentoDescricao: '',
        documentoResponsavel: '',
        documentoItemId: 'i1',
        codigoMaterial: 'M1',
        descricaoMaterial: '',
        unidade: 'UN',
        quantidade: 2,
      },
      {
        documentoId: 'doc-b',
        documentoNumero: 'B',
        documentoRevisao: '1',
        documentoDescricao: '',
        documentoResponsavel: '',
        documentoItemId: 'i2',
        codigoMaterial: 'M2',
        descricaoMaterial: '',
        unidade: 'UN',
        quantidade: 4,
      },
    ]);
    expect(payload).toHaveLength(2);
    expect(payload.find((p) => p.documentoId === 'doc-a')?.itens[0].quantidade).toBe(2);
  });

  it('valida sessao com atendente e retirante', () => {
    const linhas = [
      {
        documentoId: 'doc-a',
        documentoNumero: 'DES-A',
        documentoRevisao: 'A',
        documentoDescricao: 'Desc',
        documentoResponsavel: 'R',
        documentoItemId: 'item-a1',
        codigoMaterial: 'M1',
        descricaoMaterial: 'Mat 1',
        unidade: 'UN',
        quantidade: 3,
      },
    ];
    expect(
      obterErroRegistroSessaoRetirada(linhas, [docBase()], 'Op', 'interno', 'colab-1', '', '', '', '', '', ''),
    ).toBeNull();
    expect(
      obterErroRegistroSessaoRetirada(linhas, [docBase()], '', 'interno', 'colab-1', '', '', '', '', '', ''),
    ).toMatch(/atendente/i);
  });
});
