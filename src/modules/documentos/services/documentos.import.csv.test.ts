import { describe, expect, it } from 'vitest';
import { construirJsonImportacaoDocumentosPlanoCsv } from './documentos.import.csv';
import { montarModeloCsvImportacaoDocumentos } from './documentos.service';

describe('construirJsonImportacaoDocumentosPlanoCsv', () => {
  it('agrupa duas linhas no mesmo documento', () => {
    const csv = [
      'numero,revisao,descricao,responsavel,data_documento,observacao,codigo_material,descricao_material,unidade,quantidade_projeto,quantidade_atendida',
      'DOC-900,A,Plano,Ana,2026-04-02,,C1,Item 1,UN,100,0',
      'DOC-900,A,Plano,Ana,2026-04-02,,C2,Item 2,M,50,0',
    ].join('\n');

    const r = construirJsonImportacaoDocumentosPlanoCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const payload = JSON.parse(r.json) as { documentos: { itens: unknown[] }[] };
    expect(payload.documentos).toHaveLength(1);
    expect(payload.documentos[0].itens).toHaveLength(2);
  });
});

describe('montarModeloCsvImportacaoDocumentos', () => {
  it('gera CSV importavel com dois documentos de exemplo', () => {
    const { csv, fileName } = montarModeloCsvImportacaoDocumentos();
    expect(fileName).toBe('iso-pro-documentos-modelo-importacao.csv');
    expect(csv.charCodeAt(0)).toBe(0xfeff);

    const r = construirJsonImportacaoDocumentosPlanoCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const payload = JSON.parse(r.json) as {
      documentos: { numero: string; itens: unknown[] }[];
    };
    expect(payload.documentos).toHaveLength(2);
    expect(payload.documentos[0].numero).toBe('DOC-EXEMPLO-001');
    expect(payload.documentos[0].itens).toHaveLength(2);
    expect(payload.documentos[1].numero).toBe('DOC-EXEMPLO-002');
    expect(payload.documentos[1].itens).toHaveLength(1);
  });
});
