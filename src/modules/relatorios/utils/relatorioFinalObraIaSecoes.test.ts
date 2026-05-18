import { describe, expect, it } from 'vitest';
import type { RelatorioFinalObraDados } from '../types/relatorioFinalObra.types';
import { normalizarSecoesModuloIa } from './relatorioFinalObraIaSecoes';

function dadosBase(): RelatorioFinalObraDados {
  return {
    contexto: {
      numeroRelatorio: '',
      registrado: false,
      geradoEm: '2026-05-16T12:00:00.000Z',
      cliente: 'C',
      projeto: 'P',
      contrato: '',
      local: '',
      rodapeNome: '',
      rodapeCnpj: '',
    },
    totais: {
      documentos: 0,
      documentosCancelados: 0,
      recebimentos: 2,
      recebimentosCancelados: 0,
      rir: 0,
      rirCancelados: 0,
      rnc: 1,
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
}

describe('normalizarSecoesModuloIa', () => {
  it('ordena módulos e ignora seções sem registros', () => {
    const out = normalizarSecoesModuloIa(
      [
        { modulo: 'rir', titulo: 'RIR', paragrafos: ['Sem dados'] },
        { modulo: 'recebimentos', paragrafos: ['Dois recebimentos com divergência.'] },
        { modulo: 'rnc', paragrafos: ['Uma NC com fotos de avaria.'] },
      ],
      dadosBase(),
    );
    expect(out.map((s) => s.modulo)).toEqual(['recebimentos', 'rnc']);
    expect(out[0].paragrafos[0]).toContain('recebimentos');
  });

  it('mescla parágrafos duplicados do mesmo módulo', () => {
    const out = normalizarSecoesModuloIa(
      [
        { modulo: 'RNC', paragrafos: ['Primeiro.'] },
        { modulo: 'nao conformidade', paragrafos: ['Segundo.'] },
      ],
      dadosBase(),
    );
    expect(out).toHaveLength(1);
    expect(out[0].paragrafos).toEqual(['Primeiro.', 'Segundo.']);
  });
});
