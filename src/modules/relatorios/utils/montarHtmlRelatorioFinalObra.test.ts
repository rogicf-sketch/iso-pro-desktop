/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { montarApresentacaoRelatorioFinalObra } from './relatorioFinalObraInteligencia';
import { montarHtmlRelatorioFinalObra } from './montarHtmlRelatorioFinalObra';
import type { RelatorioFinalObraDados } from '../types/relatorioFinalObra.types';

function dadosBase(over?: Partial<RelatorioFinalObraDados>): RelatorioFinalObraDados {
  return {
    contexto: {
      numeroRelatorio: 'RFO-2026-00042',
      registrado: true,
      geradoEm: '2026-05-16T15:30:00.000Z',
      cliente: 'Cliente Obra',
      projeto: 'Projeto Teste',
      contrato: 'CT-2026',
      local: 'Jaú-SP',
      rodapeNome: 'Empresa PDF',
      rodapeCnpj: '66.234.531/0001-57',
    },
    totais: {
      documentos: 2,
      documentosCancelados: 0,
      recebimentos: 5,
      recebimentosCancelados: 1,
      rir: 3,
      rirCancelados: 0,
      rnc: 1,
      rncCancelados: 0,
      atendimentos: 4,
      atendimentosEstornados: 0,
      inventarios: 1,
      inventariosAbertos: 1,
      relatoriosFotograficos: 2,
      materiais: 100,
      colaboradores: 10,
      fornecedores: 8,
    },
    documentos: [],
    recebimentos: [
      {
        id: 'r1',
        fornecedor: 'Forn A',
        dataRecebimento: '2026-03-01',
        notaFiscal: 'NF-100',
        romaneio: '',
        conferente: 'C',
        modoRecebimento: 'direto',
        status: 'conferido',
        totalItens: 1,
        quantidadeRecebidaTotal: 1,
        quantidadeConferidaTotal: 1,
        conferenciaItensDivergentes: 0,
      },
    ],
    rir: [],
    rnc: [],
    atendimentos: [],
    inventarios: [],
    relatoriosFotograficos: [],
    ...over,
  };
}

function idsSecoes(html: string): string[] {
  return [...html.matchAll(/<section class="rfo-sec" id="([^"]+)"/g)].map((m) => m[1]);
}

function numerosSecoes(html: string): string[] {
  return [...html.matchAll(/<span class="rfo-sec-num">(\d{2})<\/span>/g)].map((m) => m[1]);
}

describe('montarHtmlRelatorioFinalObra', () => {
  it('gera documento HTML valido com indice, chrome de impressao e sem quebras forcadas', () => {
    const html = montarHtmlRelatorioFinalObra(dadosBase(), { incluirBarraPreVisualizacao: false });
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('RFO-2026-00042');
    expect(html).toContain('rfo-indice');
    expect(html).toContain('rfo-print-chrome--top');
    expect(html).toContain('rfo-print-chrome--bottom');
    expect(html).not.toContain('rfo-sec--quebra');
    expect(html).toContain('page-break-inside: auto');
    expect(html).not.toContain('page-break-before: always');
  });

  it('numera secoes em sequencia e indice aponta para os mesmos ids', () => {
    const html = montarHtmlRelatorioFinalObra(dadosBase(), { incluirBarraPreVisualizacao: false });
    const ids = idsSecoes(html);
    const nums = numerosSecoes(html);
    expect(ids.length).toBeGreaterThanOrEqual(6);
    expect(nums.length).toBe(ids.length);
    expect(nums).toEqual(['01', '02', '03', '04', '05', '06', '07'].slice(0, ids.length));
    for (const id of ids) {
      expect(html).toContain(`href="#${id}"`);
      expect(html).toContain(`id="${id}"`);
    }
  });

  it('escapa conteudo malicioso no contexto', () => {
    const html = montarHtmlRelatorioFinalObra(
      dadosBase({
        contexto: {
          ...dadosBase().contexto,
          cliente: '<script>alert(1)</script>',
          projeto: 'A & B',
        },
      }),
      { incluirBarraPreVisualizacao: false },
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('A &amp; B');
  });

  it('usa caixa vazio para destaques e mensagem adequada para fotos', () => {
    const html = montarHtmlRelatorioFinalObra(dadosBase(), { incluirBarraPreVisualizacao: false });
    expect(html).toContain('rfo-vazio');
    expect(html).toContain('Nenhuma ocorrência crítica automática');
    expect(html).toContain('sem evidências classificadas como críticas');
  });

  it('informa ausencia total de relatorios fotograficos', () => {
    const html = montarHtmlRelatorioFinalObra(
      dadosBase({ totais: { ...dadosBase().totais, relatoriosFotograficos: 0 } }),
      { incluirBarraPreVisualizacao: false },
    );
    expect(html).toContain('Nenhum relatório fotográfico registrado');
  });

  it('inclui tabela de destaques quando analise encontra ocorrencias', () => {
    const dados = dadosBase({
      recebimentos: [
        {
          id: 'r-div',
          fornecedor: 'Forn',
          dataRecebimento: '2026-04-01',
          notaFiscal: 'NF-DIV',
          romaneio: '',
          conferente: 'X',
          modoRecebimento: 'direto',
          status: 'divergente',
          totalItens: 1,
          quantidadeRecebidaTotal: 5,
          quantidadeConferidaTotal: 3,
          conferenciaItensDivergentes: 1,
        },
      ],
    });
    const html = montarHtmlRelatorioFinalObra(dados, { incluirBarraPreVisualizacao: false });
    expect(html).toContain('rfo-destaque-table');
    expect(html).toContain('NF-DIV');
    expect(html).toContain('rfo-sev-critico');
  });

  it('integra apresentacao enriquecida quando fornecida', () => {
    const dados = dadosBase();
    const ap = montarApresentacaoRelatorioFinalObra(dados, []);
    const html = montarHtmlRelatorioFinalObra({ ...dados, apresentacao: ap }, { incluirBarraPreVisualizacao: false });
    expect(html).toContain('Síntese executiva');
    expect(html).toContain('rfo-sintese');
    expect(html).toContain('Indicadores da obra');
  });

  it('opcionalmente inclui barra de pre-visualizacao no corpo HTML', () => {
    const comBarra = montarHtmlRelatorioFinalObra(dadosBase(), { incluirBarraPreVisualizacao: true });
    const semBarra = montarHtmlRelatorioFinalObra(dadosBase(), { incluirBarraPreVisualizacao: false });
    expect(comBarra).toContain('role="toolbar"');
    expect(comBarra).toContain('data-iso-pro-action="print"');
    expect(semBarra).not.toContain('role="toolbar"');
    expect(semBarra).not.toContain('data-iso-pro-action="print"');
  });

  it('capa usa classe rfo-capa para quebra apos primeira pagina na impressao', () => {
    const html = montarHtmlRelatorioFinalObra(dadosBase(), { incluirBarraPreVisualizacao: false });
    expect(html).toContain('<header class="rfo-capa">');
    expect(html).toContain('.rfo-capa { page-break-after: always');
  });
});
