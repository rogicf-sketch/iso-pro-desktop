/**
 * Planilha Excel (CSV): uma linha por item; colunas do documento repetidas por linha.
 * Agrupa por numero + revisao e monta JSON compativel com importarDocumentosDoArquivoJson.
 */

import { extrairCodigoMaterialDeObjetoImport } from '../../../lib/codigoMaterialImport';
import { parseCsvToRecordsCooperative } from '../../../lib/csv';
import { mensagemSeCabecalhoImportCsvIncompativel } from '../../../lib/csvImportHeaderGuard';
import { parseDocumentosImportJsonRoot } from '../../../lib/schemas/importArquivoPlano.zod';
import {
  IMPORT_COOPERATIVE_MIN_CSV_ROWS,
  yieldCooperativeEveryRows,
} from '../../../lib/yieldCooperativeImport';
import { validarCodigosMateriaisAtivosNoCadastroParaRecebimento } from '../../materiais/services/materiais.service';
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

export async function construirJsonImportacaoDocumentosPlanoCsv(
  text: string,
): Promise<{ ok: true; json: string } | { ok: false; error: string }> {
  const cabErr = mensagemSeCabecalhoImportCsvIncompativel('documentos', text);
  if (cabErr) {
    return { ok: false, error: cabErr };
  }
  const parsed = await parseCsvToRecordsCooperative(text);
  if (!parsed || parsed.rows.length === 0) {
    return { ok: false, error: 'CSV invalido ou sem linhas de dados (cabecalho obrigatorio).' };
  }

  const grupos = new Map<string, GrupoAcumulador>();
  const useCooperative = parsed.rows.length >= IMPORT_COOPERATIVE_MIN_CSV_ROWS;

  for (let r = 0; r < parsed.rows.length; r++) {
    const row = parsed.rows[r];
    const numero = cell(row, 'numero', 'numero_documento').trim();
    const revisao = cell(row, 'revisao', 'rev').trim() || 'A';
    const descricao = cell(row, 'descricao', 'descricao_documento').trim();
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
    const locLinha = cell(row, 'localizacao', 'localizacao_planejamento', 'localizacao_material', 'endereco_estoque').trim();
    const qProj = parseDecimal(
      cell(row, 'quantidade_projeto', 'quantidade', 'quantidade_documento', 'qtd_projeto', 'qtde'),
    );
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
      if (locLinha) {
        const prev = (existente.localizacao ?? '').trim();
        existente.localizacao = prev
          ? prev.includes(locLinha)
            ? prev
            : `${prev} | ${locLinha}`
          : locLinha;
      }
    } else {
      g.itensPorCodigo.set(ck, {
        id: `csv-doc-item-${chaveGrupo}-${ck}-${g.itensPorCodigo.size}`,
        codigoMaterial,
        descricaoMaterial,
        unidade,
        quantidadeProjeto: qProj,
        quantidadeAtendida: qAtd,
        localizacao: locLinha,
      });
    }

    if (useCooperative) {
      await yieldCooperativeEveryRows(r);
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
export async function previewImportacaoDocumentosCsv(
  text: string,
): Promise<{ ok: true; linhaCount: number } | { ok: false; error: string }> {
  const built = await construirJsonImportacaoDocumentosPlanoCsv(text);
  if (!built.ok) {
    return { ok: false, error: built.error };
  }
  let listaDocs: unknown[];
  try {
    const parsedJson: unknown = JSON.parse(built.json);
    const list = parseDocumentosImportJsonRoot(parsedJson);
    if (list === null) {
      return { ok: false, error: 'Formato invalido: esperado lista de documentos no plano de importacao.' };
    }
    listaDocs = list;
  } catch {
    return { ok: false, error: 'Falha ao analisar o plano de importacao.' };
  }
  const codigos: string[] = [];
  for (const doc of listaDocs) {
    if (!doc || typeof doc !== 'object') continue;
    const rawItens = (doc as { itens?: unknown }).itens;
    if (!Array.isArray(rawItens)) continue;
    for (const raw of rawItens) {
      if (!raw || typeof raw !== 'object') continue;
      const o = raw as Record<string, unknown>;
      const c = extrairCodigoMaterialDeObjetoImport(o);
      if (c) codigos.push(c);
    }
  }
  const matErr = await validarCodigosMateriaisAtivosNoCadastroParaRecebimento(codigos, 'import', 'documento');
  if (matErr) {
    return { ok: false, error: matErr };
  }
  const parsed = await parseCsvToRecordsCooperative(text);
  if (!parsed || parsed.rows.length === 0) {
    return { ok: false, error: 'CSV invalido ou sem linhas de dados.' };
  }
  return { ok: true, linhaCount: parsed.rows.length };
}
