import { describe, expect, it } from 'vitest';
import { construirJsonImportacaoDocumentosPlanoCsv } from './documentos.import.csv';
import { montarModeloCsvImportacaoDocumentos } from './documentos.service';

describe('construirJsonImportacaoDocumentosPlanoCsv', () => {
  it('agrupa duas linhas no mesmo documento', async () => {
    const csv = [
      'numero,revisao,descricao,responsavel,data_documento,observacao,codigo_material,descricao_material,unidade,quantidade_projeto,quantidade_atendida',
      'DOC-900,A,Plano,Ana,2026-04-02,,C1,Item 1,UN,100,0',
      'DOC-900,A,Plano,Ana,2026-04-02,,C2,Item 2,M,50,0',
    ].join('\n');

    const r = await construirJsonImportacaoDocumentosPlanoCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const payload = JSON.parse(r.json) as { documentos: { itens: unknown[] }[] };
    expect(payload.documentos).toHaveLength(1);
    expect(payload.documentos[0].itens).toHaveLength(2);
  });
});

describe('construirJsonImportacaoDocumentosPlanoCsv / colunas do export itens', () => {
  it('aceita descricao_documento e quantidade_documento como no CSV exportado pelo modulo', async () => {
    const csv = [
      'numero;revisao;descricao_documento;responsavel;data_documento;codigo_material;descricao_material;unidade;quantidade_documento;quantidade_atendida',
      'DOC-EXP-X;A;Titulo export;Ana;2026-04-13;COD-X;Material X;UN;5;0',
      'DOC-EXP-X;A;Titulo export;Ana;2026-04-13;COD-Y;Material Y;M;3;1',
    ].join('\n');

    const r = await construirJsonImportacaoDocumentosPlanoCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const payload = JSON.parse(r.json) as {
      documentos: { numero: string; descricao: string; itens: { codigoMaterial: string; quantidadeProjeto: number }[] }[];
    };
    expect(payload.documentos).toHaveLength(1);
    expect(payload.documentos[0].descricao).toBe('Titulo export');
    expect(payload.documentos[0].itens).toHaveLength(2);
    const byCod = new Map(payload.documentos[0].itens.map((it) => [it.codigoMaterial, it.quantidadeProjeto]));
    expect(byCod.get('COD-X')).toBe(5);
    expect(byCod.get('COD-Y')).toBe(3);
  });
});

describe('montarModeloCsvImportacaoDocumentos', () => {
  it('gera CSV importavel com dois documentos de exemplo', async () => {
    const { csv, fileName } = montarModeloCsvImportacaoDocumentos();
    expect(fileName).toBe('iso-pro-documentos-modelo-importacao.csv');
    expect(csv.charCodeAt(0)).toBe(0xfeff);

    const r = await construirJsonImportacaoDocumentosPlanoCsv(csv);
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
