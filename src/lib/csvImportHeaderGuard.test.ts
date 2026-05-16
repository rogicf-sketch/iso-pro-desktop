import { describe, expect, it } from 'vitest';
import {
  detectarModeloCsvImportacao,
  mensagemSeCabecalhoImportCsvIncompativel,
} from './csvImportHeaderGuard';
import { parseCsvHeadersOnly } from './csv';

describe('parseCsvHeadersOnly', () => {
  it('normaliza cabecalhos como parseCsvToRecords', () => {
    const h = parseCsvHeadersOnly('A B;C-D;E_F\r\n1;2;3');
    expect(h).toEqual(['a_b', 'cd', 'e_f']);
  });
});

describe('detectarModeloCsvImportacao', () => {
  it('identifica modelo de recebimentos em massa', () => {
    expect(
      detectarModeloCsvImportacao([
        'fornecedor',
        'data_recebimento',
        'nota_fiscal',
        'romaneio',
        'codigo',
      ]),
    ).toBe('recebimentos_plano');
  });

  it('identifica modelo de documentos', () => {
    expect(
      detectarModeloCsvImportacao([
        'numero',
        'data_documento',
        'codigo_material',
        'quantidade_projeto',
      ]),
    ).toBe('documentos');
  });

  it('identifica modelo de materiais', () => {
    expect(
      detectarModeloCsvImportacao([
        'codigo',
        'codigo_barras',
        'descricao',
        'estoque_minimo',
        'ativo',
      ]),
    ).toBe('materiais');
  });

  it('identifica modelo de fornecedores', () => {
    expect(
      detectarModeloCsvImportacao(['nome', 'cnpj', 'telefone', 'email', 'endereco', 'ativo']),
    ).toBe('fornecedores');
  });

  it('identifica modelo de itens de recebimento', () => {
    expect(
      detectarModeloCsvImportacao([
        'codigo',
        'descricao',
        'quantidade',
        'unidade',
        'localizacao',
        'certificado',
      ]),
    ).toBe('recebimentos_itens');
  });

  it('devolve desconhecido para cabecalho generico', () => {
    expect(detectarModeloCsvImportacao(['col_a', 'col_b'])).toBe('desconhecido');
  });
});

describe('mensagemSeCabecalhoImportCsvIncompativel', () => {
  const docCsv = [
    'numero;revisao;descricao;responsavel;data_documento;observacao;codigo_material;descricao_material;unidade;quantidade_projeto;quantidade_atendida',
    'D1;A;X;Ana;2026-01-01;;M1;Desc;UN;1;0',
  ].join('\n');

  const recCsv = [
    'fornecedor;data_recebimento;nota_fiscal;romaneio;conferente;modo_recebimento;observacoes;codigo;descricao;quantidade;unidade;localizacao;certificado',
    'F;2026-01-01;NF1;R1;C;direto;;M1;D;1;UN;L1;',
  ].join('\n');

  it('bloqueia documentos ao importar recebimentos em massa', () => {
    const msg = mensagemSeCabecalhoImportCsvIncompativel('recebimentos_plano', docCsv);
    expect(msg).toBeTruthy();
    expect(msg).toMatch(/Documentos/);
    expect(msg).toMatch(/Recebimentos \(plano completo\)/);
    expect(msg).toMatch(/Baixar modelo CSV/);
  });

  it('bloqueia recebimentos ao importar documentos', () => {
    const msg = mensagemSeCabecalhoImportCsvIncompativel('documentos', recCsv);
    expect(msg).toBeTruthy();
    expect(msg).toMatch(/Recebimentos \(plano completo\)/);
    expect(msg).toMatch(/Documentos/);
  });

  it('bloqueia fornecedores ao importar documentos', () => {
    const fornCsv = [
      'nome;cnpj;telefone;email;endereco;ativo',
      'ACME;12.345.678/0001-90;;;Rua A, 1;sim',
    ].join('\n');
    const msg = mensagemSeCabecalhoImportCsvIncompativel('documentos', fornCsv);
    expect(msg).toBeTruthy();
    expect(msg).toMatch(/Fornecedores/);
    expect(msg).toMatch(/Documentos/);
  });

  it('nao bloqueia quando o modelo coincide', () => {
    expect(mensagemSeCabecalhoImportCsvIncompativel('documentos', docCsv)).toBeNull();
    expect(mensagemSeCabecalhoImportCsvIncompativel('recebimentos_plano', recCsv)).toBeNull();
  });
});
