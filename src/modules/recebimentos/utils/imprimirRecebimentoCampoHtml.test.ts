import { describe, expect, it } from 'vitest';
import { montarHtmlRecebimentoCampo } from './imprimirRecebimentoCampoHtml';
import type { RecebimentoCampoRelatorioInput } from './imprimirRecebimentoCampoHtml';

function sampleRecebimento(overrides: Partial<RecebimentoCampoRelatorioInput> = {}): RecebimentoCampoRelatorioInput {
  return {
    fornecedor: 'Marcegaglia do Brasil Ltda',
    dataRecebimento: '2026-09-15',
    notaFiscal: 'NF-4433221',
    romaneio: 'ROM-2026-017',
    conferente: 'Carlos Roberto de Mello Silva',
    modoRecebimento: 'direto',
    status: 'conferido',
    observacoes: '',
    itens: [
      {
        id: '1',
        codigoMaterial: 'VESFAL1H00CG73-7918631',
        descricaoMaterial: 'VALVULA ESFERA AI FUNDIDO',
        unidade: 'PC',
        disciplina: 'Tubulacao',
        localizacao: 'ML-09',
        quantidadeRecebida: 1,
        quantidadeConferida: 1,
        pesoUnitario: 96,
        pesoTotal: 96,
        certificado: 'CERT-2026-445',
      },
    ],
    ...overrides,
  };
}

describe('montarHtmlRecebimentoCampo', () => {
  it('inclui cabecalho da NF, fornecedor, romaneio e certificado na folha', () => {
    const html = montarHtmlRecebimentoCampo(sampleRecebimento());

    expect(html).toContain('NF-4433221');
    expect(html).toContain('ROM-2026-017');
    expect(html).toContain('Marcegaglia do Brasil Ltda');
    expect(html).toContain('VESFAL1H00CG73-7918631');
    expect(html).toContain('VALVULA ESFERA AI FUNDIDO');
    expect(html).toContain('ML-09');
    expect(html).toContain('CERT-2026-445');
    expect(html).toContain('Folha de campo — recebimento / conferencia');
    expect(html).toContain('Codigo');
    expect(html).toContain('Descricao');
    expect(html).toContain('Localizacao');
    expect(html).toContain('Qtd rec.');
    expect(html).toContain('Certificado');
  });

  it('modo direto marca linhas como Recebido em vez de Pendente', () => {
    const html = montarHtmlRecebimentoCampo(
      sampleRecebimento({
        itens: [
          {
            id: '1',
            codigoMaterial: 'MAT-1',
            descricaoMaterial: 'Item teste',
            unidade: 'PC',
            disciplina: '',
            localizacao: 'A-01',
            quantidadeRecebida: 2,
            quantidadeConferida: 0,
            pesoUnitario: 0,
            pesoTotal: 0,
          },
        ],
      }),
    );
    expect(html).toContain('Recebido');
    expect(html).not.toContain('Pendente');
  });

  it('modo aguardando conferencia mostra coluna qtd conferida', () => {
    const html = montarHtmlRecebimentoCampo(
      sampleRecebimento({
        modoRecebimento: 'aguardando_conferencia',
        status: 'aguardando_conferencia',
        itens: [
          {
            id: '1',
            codigoMaterial: 'MAT-1',
            descricaoMaterial: 'Item teste',
            unidade: 'PC',
            disciplina: '',
            localizacao: 'A-01',
            quantidadeRecebida: 2,
            quantidadeConferida: 0,
            pesoUnitario: 0,
            pesoTotal: 0,
          },
        ],
      }),
    );
    expect(html).toContain('Qtd conferida');
    expect(html).toContain('Pendente');
  });

  it('aceita recebimento sem itens', () => {
    const html = montarHtmlRecebimentoCampo(sampleRecebimento({ itens: [] }));
    expect(html).toContain('Nenhum item neste recebimento.');
  });
});
