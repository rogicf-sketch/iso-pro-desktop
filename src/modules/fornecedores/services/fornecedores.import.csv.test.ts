import { describe, expect, it } from 'vitest';
import { montarModeloCsvImportacaoDocumentos } from '../../documentos/services/documentos.service';
import {
  fornecedorRowToFormData,
  montarModeloCsvImportacaoFornecedores,
  previewImportacaoFornecedoresCsv,
} from './fornecedores.import.csv';

describe('montarModeloCsvImportacaoFornecedores', () => {
  it('gera CSV com BOM e nome de arquivo', () => {
    const { csv, fileName } = montarModeloCsvImportacaoFornecedores();
    expect(fileName).toBe('iso-pro-fornecedores-modelo-importacao.csv');
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('nome;cnpj;telefone');
  });
});

describe('previewImportacaoFornecedoresCsv', () => {
  it('aceita modelo gerado', () => {
    const { csv } = montarModeloCsvImportacaoFornecedores();
    const p = previewImportacaoFornecedoresCsv(csv);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.linhaCount).toBe(2);
  });

  it('recusa cabecalho de documentos', () => {
    const { csv } = montarModeloCsvImportacaoDocumentos();
    const p = previewImportacaoFornecedoresCsv(csv);
    expect(p.ok).toBe(false);
    if (p.ok) return;
    expect(p.error).toMatch(/Documentos/);
    expect(p.error).toMatch(/Fornecedores/);
  });
});

describe('fornecedorRowToFormData', () => {
  it('mapeia colunas padrao', () => {
    const f = fornecedorRowToFormData({
      nome: 'Forn X',
      cnpj: '00.000.000/0001-00',
      telefone: '(11) 1',
      email: 'a@b.com',
      endereco: 'Rua 1',
      ativo: 'nao',
    });
    expect(f.nome).toBe('Forn X');
    expect(f.ativo).toBe(false);
  });
});
