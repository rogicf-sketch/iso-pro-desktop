/**
 * Planilha Excel (CSV): uma linha por item; colunas do documento repetidas por linha.
 * Agrupa por numero + revisao e monta JSON compativel com importarDocumentosDoArquivoJson.
 */

import { parseCsvToRecords } from '../../../lib/csv';
import type { DocumentoItem } from '../types/documento.types';

function cell(row: Record<string, string>, ...aliases: string[]): string {
  for (const key of aliases) {
    if (row[key] !== undefined && String(row[key]).trim() !== '') {
      return String(row[key]);
    }
  }
  return '';
}

function parseDecimal(s: string): number {
  const t = s.trim();
  if (!t) return 0;
  const normalized = t.includes(',') && !t.includes('.') ? t.replace(',', '.') : t;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

type GrupoAcumulador = {
  numero: string;
  revisao: string;
  descricao: string;
  responsavel: string;
  dataDocumento: string;
  observacao: string;
  itensPorCodigo: Map<string, DocumentoItem>;
};

export function construirJsonImportacaoDocumentosPlanoCsv(
  text: string,
): { ok: true; json: string } | { ok: false; error: string } {
  const parsed = parseCsvToRecords(text);
  if (!parsed || parsed.rows.length === 0) {
    return { ok: false, error: 'CSV invalido ou sem linhas de dados (cabecalho obrigatorio).' };
  }

  const grupos = new Map<string, GrupoAcumulador>();

  for (let r = 0; r < parsed.rows.length; r++) {
    const row = parsed.rows[r];
    const numero = cell(row, 'numero', 'numero_documento').trim();
    const revisao = cell(row, 'revisao', 'rev').trim() || 'A';
    const descricao = cell(row, 'descricao').trim();
    const responsavel = cell(row, 'responsavel').trim();
    const dataDocumento = cell(row, 'data_documento', 'data', 'datadocumento').trim();
    const observacao = cell(row, 'observacao', 'observacoes', 'obs').trim();

    if (!numero || !dataDocumento) {
      return {
        ok: false,
        error: `Linha ${r + 2}: numero e data_documento sao obrigatorios.`,
      };
    }

    const chaveGrupo = `${numero.toLowerCase()}|${revisao.toLowerCase()}`;

    if (!grupos.has(chaveGrupo)) {
      grupos.set(chaveGrupo, {
        numero,
        revisao,
        descricao,
        responsavel,
        dataDocumento,
        observacao,
        itensPorCodigo: new Map(),
      });
    } else if (descricao || responsavel || dataDocumento || observacao) {
      const g = grupos.get(chaveGrupo)!;
      if (descricao) g.descricao = descricao;
      if (responsavel) g.responsavel = responsavel;
      if (dataDocumento) g.dataDocumento = dataDocumento;
      if (observacao) g.observacao = observacao;
    }

    const g = grupos.get(chaveGrupo)!;

    const codigoMaterial = cell(row, 'codigo_material', 'codigo').trim();
    const descricaoMaterial = cell(row, 'descricao_material', 'descricao_item').trim();
    const unidade = cell(row, 'unidade', 'um').trim() || 'UN';
    const qProj = parseDecimal(cell(row, 'quantidade_projeto', 'quantidade', 'qtd_projeto', 'qtde'));
    const qAtd = parseDecimal(cell(row, 'quantidade_atendida', 'qtd_atendida'));

    if (!codigoMaterial) {
      return {
        ok: false,
        error: `Linha ${r + 2}: codigo_material e obrigatorio em cada linha de item.`,
      };
    }
    /** descricao_material pode ficar vazio; a importacao completa a partir do cadastro de materiais quando possivel. */

    const ck = codigoMaterial.toLowerCase();
    const existente = g.itensPorCodigo.get(ck);
    if (existente) {
      existente.quantidadeProjeto += qProj;
      existente.quantidadeAtendida += qAtd;
    } else {
      g.itensPorCodigo.set(ck, {
        id: `csv-doc-item-${chaveGrupo}-${ck}-${g.itensPorCodigo.size}`,
        codigoMaterial,
        descricaoMaterial,
        unidade,
        quantidadeProjeto: qProj,
        quantidadeAtendida: qAtd,
      });
    }
  }

  const documentos = [...grupos.values()].map((gr) => ({
    numero: gr.numero,
    revisao: gr.revisao,
    descricao: gr.descricao,
    responsavel: gr.responsavel,
    dataDocumento: gr.dataDocumento,
    observacao: gr.observacao,
    itens: [...gr.itensPorCodigo.values()],
  }));

  const payload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    documentos,
  };

  return { ok: true, json: JSON.stringify(payload) };
}

/** Leitura previa do CSV (contagem de linhas de dados) antes de confirmar importacao na UI. */
export function previewImportacaoDocumentosCsv(
  text: string,
): { ok: true; linhaCount: number } | { ok: false; error: string } {
  const built = construirJsonImportacaoDocumentosPlanoCsv(text);
  if (!built.ok) {
    return { ok: false, error: built.error };
  }
  const parsed = parseCsvToRecords(text);
  if (!parsed || parsed.rows.length === 0) {
    return { ok: false, error: 'CSV invalido ou sem linhas de dados.' };
  }
  return { ok: true, linhaCount: parsed.rows.length };
}
