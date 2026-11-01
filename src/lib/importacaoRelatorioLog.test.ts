import { describe, expect, it } from 'vitest';
import { montarLogRelatorioImportacao, nomeArquivoLogImportacao } from './importacaoRelatorioLog';

describe('importacaoRelatorioLog', () => {
  it('monta log com resumo e detalhes', () => {
    const text = montarLogRelatorioImportacao({
      modulo: 'Planejamento',
      mensagem: 'Nenhuma alteracao aplicada.',
      ficheiroOrigem: 'teste.csv',
      criados: 0,
      atualizados: 0,
      ignorados: 2,
      detalhes: ['DOC-1: ignorado.', 'DOC-2: ignorado.'],
    });
    expect(text).toContain('Planejamento');
    expect(text).toContain('teste.csv');
    expect(text).toContain('Nenhuma alteracao aplicada.');
    expect(text).toContain('Ignorados: 2');
    expect(text).toContain('DOC-1: ignorado.');
    expect(text).toContain('DOC-2: ignorado.');
  });

  it('gera nome de ficheiro com slug', () => {
    expect(nomeArquivoLogImportacao('planejamento')).toMatch(/^iso-pro-importacao-planejamento-/);
  });
});
