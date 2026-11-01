import { describe, expect, it, vi } from 'vitest';
import {
  defaultRncEvidencias,
  defaultRncPlanoLinhas,
  defaultRncTiposOcorrencia,
  type RncRegistro,
} from '../types/qualidade.types';
import {
  deveIncluirParecerEncerramento,
  evidenciasObjectivasActivas,
  legendaEvidenciaRnc,
  linhasPlanoPreenchidas,
  montarHtmlRnc,
  tiposOcorrenciaActivos,
} from './imprimirRncHtml';

vi.mock('../../configuracoes/services/configuracoes.service', () => ({
  readConfiguracoes: vi.fn(() => ({
    documentoRodapeNome: 'I.S.O PRO',
    documentoRodapeCnpj: '66.234.531/0001-57',
    logoInstitucionalUrl: '',
    logoInstitucionalTamanhoRelatorio: 'auto',
  })),
}));

function rncMinimo(overrides: Partial<RncRegistro> = {}): RncRegistro {
  return {
    id: 'rnc-1',
    codigo: 'RNC-2026-002',
    dataRegistro: '2026-07-19',
    setor: 'Materiais',
    responsavel: 'Igor',
    descricao: 'Cabo avariado na descarga.',
    status: 'aberto',
    planoAcao: '',
    observacoes: '',
    recebimentoId: 'rec-1',
    recebimentoNotaFiscal: 'NF-18821',
    recebimentoFornecedor: 'Metalúrgica Aurora',
    recebimentoRomaneio: '',
    recebimentoData: '2026-07-18',
    pedidoCompra: '',
    itemRecebimentoId: '',
    materialCodigo: '',
    materialDescricao: '',
    quantidadeRejeitada: 0,
    quantidadeRecebidaRef: 0,
    localArmazenagem: 'quarentena',
    localArmazenagemOutro: '',
    tiposOcorrencia: defaultRncTiposOcorrencia(),
    descricaoDetalhada: '',
    evidencias: defaultRncEvidencias(),
    evidenciasObservacao: '',
    acaoImediataTipo: 'quarentena_bloqueado',
    acaoImediataObservacoes: '',
    analiseCausaRaiz: '',
    planoAcaoLinhas: defaultRncPlanoLinhas(),
    encerramentoParecer: '',
    assinaturaResponsavelRnc: { nome: 'Igor Santos', data: '2026-07-19' },
    assinaturaQualidade: { nome: 'Ana Lima', data: '2026-07-19' },
    assinaturaFornecedor: { nome: '', data: '' },
    itensRnc: [
      {
        recebimentoItemId: 'it-1',
        incluir: true,
        codigoMaterial: 'CAB-2.5-VM',
        descricaoMaterial: 'Cabo flexível 2,5 mm² vermelho',
        unidade: 'M',
        disciplina: 'ELE',
        localizacao: '',
        quantidadeRecebida: 200,
        quantidadeConferida: 198,
        pesoUnitario: 0,
        pesoTotal: 0,
        certificado: 'N/A',
        quantidadeRejeitada: 12,
        tiposOcorrencia: { ...defaultRncTiposOcorrencia(), avariaFisica: true },
        descricaoDetalhada: 'Isolação cortada na descarga do caminhão.',
        fotosDataUrls: ['data:image/png;base64,AAA'],
        fotosDeclaradasSemArquivo: false,
      },
    ],
    ...overrides,
  };
}

describe('helpers do relatorio RNC', () => {
  it('lista so tipos verdadeiros', () => {
    const tipos = tiposOcorrenciaActivos({
      ...defaultRncTiposOcorrencia(),
      avariaFisica: true,
      outro: true,
      outroTexto: 'Embalagem molhada',
    });
    expect(tipos).toEqual(['Avaria física / dano', 'Outro: Embalagem molhada']);
    expect(tipos.join(' ')).not.toMatch(/Não|Nao/);
  });

  it('omite linhas vazias do plano padrao', () => {
    expect(linhasPlanoPreenchidas(defaultRncPlanoLinhas())).toEqual([]);
    expect(linhasPlanoPreenchidas([{ acao: 'Isolar lote', responsavel: 'Igor', prazo: '2026-07-21' }])).toHaveLength(1);
  });

  it('nao trata checkbox de fotos como anexo objectivo', () => {
    expect(evidenciasObjectivasActivas({ ...defaultRncEvidencias(), fotosAnexadas: true }, '')).toEqual([]);
    expect(evidenciasObjectivasActivas({ ...defaultRncEvidencias(), copiaNf: true }, '')).toEqual(['Cópia da NF']);
  });

  it('parecer so entra no fechamento ou quando preenchido', () => {
    expect(deveIncluirParecerEncerramento(rncMinimo())).toBe(false);
    expect(deveIncluirParecerEncerramento(rncMinimo({ status: 'concluido' }))).toBe(true);
    expect(deveIncluirParecerEncerramento(rncMinimo({ encerramentoParecer: 'rejeitado' }))).toBe(true);
  });

  it('legenda da foto e so o numero da figura', () => {
    expect(legendaEvidenciaRnc(rncMinimo().itensRnc[0], 0)).toBe('Figura 1');
  });
});

describe('montarHtmlRnc', () => {
  it('usa envelope institucional com Folha X/N nativa, sem Paged.js', async () => {
    const html = await montarHtmlRnc(rncMinimo());
    expect(html).toContain('id="iso-pdf-meta"');
    expect(html).toContain('"footerPrefix":"Folha"');
    expect(html).toContain('"footerOnly":true');
    expect(html).toContain('class="rnc-print-body iso-report-native-body"');
    expect(html).not.toContain('paged.polyfill');
    expect(html).toContain('Relatório de não conformidade');
    expect(html).toContain('RNC-2026-002');
    expect(html).toContain('Documento oficial de registo e tratamento de NC');
    expect(html).toContain('Qualidade · Recebimento');
    expect(html).toContain('class="rnc-st-pill');
    expect(html).toContain('rnc-context-label');
    expect(html).toContain('<figcaption>Figura 1</figcaption>');
    expect(html).toMatch(/\.rnc-doc::before/s);
    expect(html).not.toContain('class="rnc-frame"');
    expect(html).toContain('Documento controlado');
    expect(html).toContain('iso-doc-foot__qr');
    expect(html).not.toContain('I.S.O PRO Desktop');
  });

  it('escreve a ocorrencia como documento, nao como ficha', async () => {
    const html = await montarHtmlRnc(rncMinimo());
    expect(html).toContain('Metalúrgica Aurora');
    expect(html).toContain('NF-18821');
    expect(html).toContain('CAB-2.5-VM');
    expect(html).toContain('Isolação cortada na descarga do caminhão.');
    expect(html).toContain('Avaria física / dano');
    expect(html).toContain('Área de quarentena');
    expect(html).toContain('Material segregado em quarentena');
    expect(html).toContain('class="rnc-dossie"');
    expect(html).toContain('class="rnc-context"');
    expect(html).toContain('rejeitadas');
    expect(html).not.toContain('class="rnc-info-grid"');
    expect(html).not.toContain('class="rnc-kpi');
    expect(html).not.toContain('Item em não conformidade');
    expect(html).not.toContain('Qtd. rec.');
    expect(html).not.toContain('<th>#</th>');
    expect(html).not.toContain('5 Porqu');
    expect(html).not.toContain('Fotos anexadas');
    expect((html.match(/CAB-2.5-VM/g) ?? []).length).toBe(1);
  });

  it('omite campos e secoes vazias', async () => {
    const html = await montarHtmlRnc(rncMinimo());
    expect(html).not.toContain('Pedido de compra');
    expect(html).not.toContain('Pedido PO');
    expect(html).not.toContain('ROM-');
    expect(html).not.toContain('Análise da causa');
    expect(html).not.toContain('Plano de ação');
    expect(html).not.toContain('Contraparte');
    expect(html).not.toContain('Parecer');
  });

  it('inclui causa, plano, parecer e contraparte so quando preenchidos', async () => {
    const html = await montarHtmlRnc(
      rncMinimo({
        status: 'concluido',
        encerramentoParecer: 'rejeitado',
        analiseCausaRaiz: 'Impacto no içamento.',
        planoAcaoLinhas: [{ acao: 'Devolver ao fornecedor', responsavel: 'Qualidade', prazo: '2026-07-25' }],
        planoAcao: '',
        pedidoCompra: 'PO-441',
        recebimentoRomaneio: 'ROM-12',
        assinaturaFornecedor: { nome: 'João Fornecedor', data: '2026-07-20' },
        evidencias: { ...defaultRncEvidencias(), copiaNf: true },
      }),
    );
    expect(html).toContain('Pedido PO-441');
    expect(html).toContain('ROM-12');
    expect(html).toContain('Análise da causa');
    expect(html).toContain('Impacto no içamento.');
    expect(html).toContain('Plano de ação');
    expect(html).toContain('Devolver ao fornecedor');
    expect(html).toContain('Parecer');
    expect(html).toContain('Rejeitado');
    expect(html).toContain('Contraparte');
    expect(html).toContain('João Fornecedor');
    expect(html).toContain('Cópia da NF');
  });

  it('nao usa grelha tipo Excel nem cabecalho repetido em tabela', async () => {
    const html = await montarHtmlRnc(rncMinimo());
    expect(html).not.toContain('class="rnc-frame"');
    expect(html).not.toContain('table-header-group');
    expect(html).toMatch(/\.rnc-codigo\s*\{[^}]*font-size:\s*15pt/s);
    expect(html).toMatch(/\.rnc-dossie\s*\{[^}]*border-left:\s*3px/s);
  });

  it('fotos cabem na folha e nao forcam quebra', async () => {
    const html = await montarHtmlRnc(rncMinimo());
    expect(html).toContain('Figura 1');
    expect(html).not.toContain('Evidência 1 —');
    expect(html).toMatch(/\.rnc-photo\s*\{[^}]*page-break-inside:\s*auto/s);
    expect(html).not.toMatch(/\.rnc-sec\s*\{[^}]*page-break-inside:\s*avoid/s);
  });
});
