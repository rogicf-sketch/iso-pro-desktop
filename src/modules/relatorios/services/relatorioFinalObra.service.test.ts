/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';
import {
  formatarDataRelatorioFinal,
  preverProximoNumeroRelatorioFinalObra,
  registrarRelatorioFinalObra,
  reservarNumeroRelatorioFinalObra,
  zerarNumeracaoRelatorioFinalObra,
} from './relatorioFinalObra.service';
import { montarHtmlRelatorioFinalObra } from '../utils/montarHtmlRelatorioFinalObra';
import type { RelatorioFinalObraDados } from '../types/relatorioFinalObra.types';

const dadosVazios: RelatorioFinalObraDados = {
  contexto: {
    numeroRelatorio: 'RFO-2026-00001',
    registrado: true,
    geradoEm: '2026-05-16T12:00:00.000Z',
    cliente: 'Cliente Teste',
    projeto: 'Projeto A',
    contrato: 'CT-1',
    local: 'Obra X',
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

describe('formatarDataRelatorioFinal', () => {
  it('retorna traco para valor vazio', () => {
    expect(formatarDataRelatorioFinal('')).toBe('—');
  });

  it('formata ISO em pt-BR', () => {
    const s = formatarDataRelatorioFinal('2026-05-16T15:30:00.000Z');
    expect(s).not.toBe('—');
    expect(s.length).toBeGreaterThan(5);
  });
});

describe('numeracao RFO', () => {
  const seqKey = getScopedIsoProStorageKey('iso-pro-relatorio-final-obra-num-seq');
  const migKey = getScopedIsoProStorageKey('iso-pro-rfo-seq-migrated-registro-v1');

  beforeEach(() => {
    localStorage.removeItem(seqKey);
    localStorage.removeItem(migKey);
    zerarNumeracaoRelatorioFinalObra();
    localStorage.setItem(migKey, '1');
  });

  it('preverProximoNumero inicia em 00001', () => {
    expect(preverProximoNumeroRelatorioFinalObra()).toBe('RFO-2026-00001');
  });

  it('registrar incrementa sequencia; segunda reserva avanca', () => {
    const base = { ...dadosVazios, contexto: { ...dadosVazios.contexto, registrado: false, numeroRelatorio: '' } };
    const reg = registrarRelatorioFinalObra(base);
    expect(reg.contexto.numeroRelatorio).toBe('RFO-2026-00001');
    expect(reg.contexto.registrado).toBe(true);
    expect(preverProximoNumeroRelatorioFinalObra()).toBe('RFO-2026-00002');
    expect(reservarNumeroRelatorioFinalObra()).toBe('RFO-2026-00002');
  });
});

describe('montarHtmlRelatorioFinalObra', () => {
  it('inclui numero, indice e secoes principais sem quebras forcadas', () => {
    const html = montarHtmlRelatorioFinalObra(dadosVazios, { incluirBarraPreVisualizacao: false });
    expect(html).toContain('RFO-2026-00001');
    expect(html).toContain('Relatório Final de Obra');
    expect(html).toContain('rfo-indice');
    expect(html).toContain('Síntese executiva');
    expect(html).toContain('RIR — certificados');
    expect(html).toContain('Ocorrências em destaque');
    expect(html).toContain('Declaração de encerramento');
    expect(html).not.toContain('rfo-sec--quebra');
    expect(html).toContain('rfo-print-chrome');
  });
});
