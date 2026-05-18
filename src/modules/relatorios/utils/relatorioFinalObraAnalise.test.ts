import { describe, expect, it } from 'vitest';
import type { RelatorioFinalObraDados } from '../types/relatorioFinalObra.types';
import {
  RFO_LIMITE_LISTA_COMPLETA_PDF,
  analisarRelatorioFinalObra,
} from './relatorioFinalObraAnalise';

const base: RelatorioFinalObraDados = {
  contexto: {
    numeroRelatorio: 'RFO-2026-00001',
    registrado: true,
    geradoEm: '2026-05-16T12:00:00.000Z',
    cliente: '',
    projeto: '',
    contrato: '',
    local: '',
    rodapeNome: '',
    rodapeCnpj: '',
  },
  totais: {
    documentos: 0,
    documentosCancelados: 0,
    recebimentos: 0,
    recebimentosCancelados: 0,
    rir: 0,
    rirCancelados: 0,
    rnc: 0,
    rncCancelados: 0,
    atendimentos: 0,
    atendimentosEstornados: 0,
    inventarios: 0,
    inventariosAbertos: 0,
    relatoriosFotograficos: 0,
    materiais: 0,
    colaboradores: 0,
    fornecedores: 0,
  },
  documentos: [],
  recebimentos: [],
  rir: [],
  rnc: [],
  atendimentos: [],
  inventarios: [],
  relatoriosFotograficos: [],
};

describe('analisarRelatorioFinalObra', () => {
  it('ativa modo resumido acima do limite', () => {
    const recebimentos = Array.from({ length: RFO_LIMITE_LISTA_COMPLETA_PDF + 1 }, (_, i) => ({
      id: `r${i}`,
      fornecedor: 'F',
      dataRecebimento: '2026-01-01',
      notaFiscal: `NF-${i}`,
      romaneio: '',
      conferente: 'X',
      modoRecebimento: 'direto' as const,
      status: 'conferido' as const,
      totalItens: 1,
      quantidadeRecebidaTotal: 1,
      quantidadeConferidaTotal: 1,
      conferenciaItensDivergentes: 0,
    }));
    const analise = analisarRelatorioFinalObra({ ...base, recebimentos });
    expect(analise.usarModoResumido).toBe(true);
  });

  it('marca recebimento divergente como destaque crítico', () => {
    const analise = analisarRelatorioFinalObra({
      ...base,
      recebimentos: [
        {
          id: '1',
          fornecedor: 'Forn',
          dataRecebimento: '2026-03-01',
          notaFiscal: 'NF-99',
          romaneio: '',
          conferente: 'C',
          modoRecebimento: 'direto',
          status: 'divergente',
          totalItens: 2,
          quantidadeRecebidaTotal: 10,
          quantidadeConferidaTotal: 8,
          conferenciaItensDivergentes: 1,
        },
      ],
    });
    expect(analise.destaques.some((d) => d.severidade === 'critico' && d.referencia === 'NF-99')).toBe(true);
  });
});
