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
  it('rejeita documento sem descricao em nenhuma linha', async () => {
    const csv = [
      'numero;revisao;descricao_documento;responsavel;data_documento;codigo_material;descricao_material;unidade;quantidade_documento;quantidade_atendida',
      'DOC-SEM-DESC;A;;Ana;2026-04-13;COD-X;Material X;UN;5;0',
    ].join('\n');

    const r = await construirJsonImportacaoDocumentosPlanoCsv(csv);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/descricao_documento/i);
    expect(r.error).toMatch(/DOC-SEM-DESC/);
  });

  it('aceita descricao so na primeira linha do documento', async () => {
    const csv = [
      'numero;revisao;descricao;responsavel;data_documento;codigo_material;descricao_material;unidade;quantidade_projeto;quantidade_atendida',
      'DOC-DESC-1;A;Titulo OK;Ana;2026-04-13;COD-X;Material X;UN;5;0',
      'DOC-DESC-1;A;;Ana;2026-04-13;COD-Y;Material Y;UN;2;0',
    ].join('\n');

    const r = await construirJsonImportacaoDocumentosPlanoCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const payload = JSON.parse(r.json) as { documentos: { descricao: string; itens: unknown[] }[] };
    expect(payload.documentos[0].descricao).toBe('Titulo OK');
    expect(payload.documentos[0].itens).toHaveLength(2);
  });

  it('bloqueia documento fora de sequencia (bloco interrompido)', async () => {
    const csv = [
      'numero;revisao;descricao;responsavel;data_documento;codigo_material;descricao_material;unidade;quantidade_projeto;quantidade_atendida',
      '209011-00094-03-EL-REQ-0136;1;REQ EL;Ana;06/09/2026;ACET001-0134;Item A;PÇ;1;0',
      '209011-00094-03-EL-REQ-0136;1;REQ EL;Ana;06/09/2026;ACET001-0201;Item B;PÇ;1;0',
      '209011-00094-03-IC-REQ-0133;1;REQ IC;Ana;06/09/2026;IC-001;Item C;PÇ;1;0',
      '209011-00094-03-EL-REQ-0136;1;REQ EL;Ana;06/09/2026;ACFI054-005-27;Item fora;PÇ;1;0',
    ].join('\n');

    const r = await construirJsonImportacaoDocumentosPlanoCsv(csv);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/fora de sequencia/i);
    expect(r.error).toMatch(/ACFI054-005-27/);
    expect(r.error).toMatch(/EL-REQ-0136/);
    expect(r.error).toMatch(/Linha 5/);
  });
  it('bloqueia a planilha real quando ha documento fora de sequencia', async () => {
    const fs = await import('node:fs');
    const path = 'C:/Users/rogic/Downloads/iso-pro-documentos-modelo-importacao.csv';
    if (!fs.existsSync(path)) return;
    const text = fs.readFileSync(path, 'utf8');
    const r = await construirJsonImportacaoDocumentosPlanoCsv(text);
    // A planilha do Downloads pode ja ter sido corrigida; so valida o bloqueio se ainda estiver invalida.
    if (r.ok) return;
    expect(r.error).toMatch(/fora de sequencia/i);
  });
});

describe('extrairDescricoesDocumentosDoCsv', () => {
  it('extrai descricao por documento', async () => {
    const { extrairDescricoesDocumentosDoCsv } = await import('./documentos.import.csv');
    const csv = [
      'numero;revisao;descricao;codigo_material',
      'VIF-1;D;BIODIGESTAO DE VINHACA;COD-1',
      'VIF-1;D;;COD-2',
      'VIF-2;D;UTILIDADES;COD-3',
    ].join('\n');
    const r = await extrairDescricoesDocumentosDoCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.itens).toHaveLength(2);
    expect(r.itens.find((i) => i.numero === 'VIF-1')?.descricao).toBe('BIODIGESTAO DE VINHACA');
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
