import { describe, expect, it } from 'vitest';
import { materialRegistroCsvParaFormData } from './materiais.import.pipeline';
import { montarModeloCsvImportacaoMateriais, previewImportacaoMateriaisCsv } from './materiais.service';

describe('materialRegistroCsvParaFormData', () => {
  it('maps standard columns', () => {
    const form = materialRegistroCsvParaFormData({
      codigo: 'TB-1',
      descricao: 'Tubo',
      diametro: '2"',
      disciplina: 'Tubulacao',
      unidade: 'UN',
      peso: '12.5',
      estoque_minimo: '10',
      observacao: 'obs',
      ativo: 'sim',
    });
    expect(form.codigo).toBe('TB-1');
    expect(form.descricao).toBe('Tubo');
    expect(form.peso).toBe(12.5);
    expect(form.estoqueMinimo).toBe(10);
    expect(form.ativo).toBe(true);
  });

  it('parses decimal with comma', () => {
    const form = materialRegistroCsvParaFormData({
      codigo: 'X',
      descricao: 'Y',
      disciplina: 'Z',
      unidade: 'M',
      peso: '0,35',
      estoque_minimo: '0',
    });
    expect(form.peso).toBe(0.35);
  });

  it('parses ativo nao', () => {
    const form = materialRegistroCsvParaFormData({
      codigo: 'X',
      descricao: 'Y',
      disciplina: 'Z',
      unidade: 'UN',
      ativo: 'nao',
    });
    expect(form.ativo).toBe(false);
  });

  it('accepts codigo_material alias', () => {
    const form = materialRegistroCsvParaFormData({
      codigo_material: 'ALT',
      descricao: 'Nome',
      disciplina: 'Estruturas',
      unidade: 'BR',
    });
    expect(form.codigo).toBe('ALT');
  });
});

describe('montarModeloCsvImportacaoMateriais', () => {
  it('gera CSV aceito pelo preview de importacao', () => {
    const { csv, fileName } = montarModeloCsvImportacaoMateriais();
    expect(fileName).toBe('iso-pro-materiais-modelo-importacao.csv');
    const p = previewImportacaoMateriaisCsv(csv);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.linhaCount).toBeGreaterThanOrEqual(2);
  });
});
