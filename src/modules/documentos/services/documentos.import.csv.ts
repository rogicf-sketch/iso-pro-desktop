/**
 * Planilha Excel (CSV): uma linha por item; colunas do documento repetidas por linha.
 * Agrupa por numero + revisao e monta JSON compativel com importarDocumentosDoArquivoJson.
 *
 * Regra: todas as linhas do mesmo documento (numero+revisao) devem ser contiguas.
 * Linha fora de sequencia → bloqueio com aviso (a planilha tem de estar correcta).
 */

import { parseCsvToRecords, parseCsvToRecordsCooperative } from '../../../lib/csv';
import { mensagemSeCabecalhoImportCsvIncompativel } from '../../../lib/csvImportHeaderGuard';
import {
  IMPORT_COOPERATIVE_MIN_CSV_ROWS,
  yieldCooperativeEveryRows,
} from '../../../lib/yieldCooperativeImport';
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
  /** Primeira linha Excel (1-based com cabecalho) deste bloco. */
  linhaInicioBloco: number;
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
  /** Documentos cujo bloco ja terminou (apareceu outro numero/revisao a seguir). */
  const blocosEncerrados = new Set<string>();
  let chaveBlocoAtual: string | null = null;
  const useCooperative = parsed.rows.length >= IMPORT_COOPERATIVE_MIN_CSV_ROWS;

  for (let r = 0; r < parsed.rows.length; r++) {
    const row = parsed.rows[r];
    const numeroLinhaExcel = r + 2;
    const numero = cell(row, 'numero', 'numero_documento').trim();
    const revisao = cell(row, 'revisao', 'rev').trim() || 'A';
    const descricao = cell(row, 'descricao', 'descricao_documento').trim();
    const responsavel = cell(row, 'responsavel').trim();
    const dataDocumento = cell(row, 'data_documento', 'data', 'datadocumento').trim();
    const observacao = cell(row, 'observacao', 'observacoes', 'obs').trim();

    if (!numero || !dataDocumento) {
      return {
        ok: false,
        error: `Linha ${numeroLinhaExcel}: numero e data_documento sao obrigatorios.`,
      };
    }

    const chaveGrupo = `${numero.toLowerCase()}|${revisao.toLowerCase()}`;
    const codigoMaterial = cell(row, 'codigo_material', 'codigo').trim();

    if (chaveBlocoAtual !== null && chaveGrupo !== chaveBlocoAtual) {
      blocosEncerrados.add(chaveBlocoAtual);
    }
    if (blocosEncerrados.has(chaveGrupo)) {
      const primeiro = grupos.get(chaveGrupo);
      const inicio = primeiro?.linhaInicioBloco ?? '?';
      const itemHint = codigoMaterial ? ` (item ${codigoMaterial})` : '';
      return {
        ok: false,
        error:
          `Linha ${numeroLinhaExcel}: documento ${numero} rev. ${revisao} fora de sequencia${itemHint}. ` +
          `O bloco deste documento comeca na linha ${inicio} e ja foi interrompido por outro desenho. ` +
          `A planilha tem de estar correcta: agrupe todas as linhas do mesmo numero+revisao em sequencia continua, sem intercalacoes. Importacao bloqueada.`,
      };
    }
    chaveBlocoAtual = chaveGrupo;

    if (!grupos.has(chaveGrupo)) {
      grupos.set(chaveGrupo, {
        numero,
        revisao,
        descricao,
        responsavel,
        dataDocumento,
        observacao,
        itensPorCodigo: new Map(),
        linhaInicioBloco: numeroLinhaExcel,
      });
    } else if (descricao || responsavel || dataDocumento || observacao) {
      const g = grupos.get(chaveGrupo)!;
      if (descricao) g.descricao = descricao;
      if (responsavel) g.responsavel = responsavel;
      if (dataDocumento) g.dataDocumento = dataDocumento;
      if (observacao) g.observacao = observacao;
    }

    const g = grupos.get(chaveGrupo)!;

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
        error: `Linha ${numeroLinhaExcel}: codigo_material e obrigatorio em cada linha de item.`,
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

  for (const gr of grupos.values()) {
    if (!gr.descricao.trim()) {
      return {
        ok: false,
        error: `Documento ${gr.numero} rev. ${gr.revisao}: descricao_documento (ou descricao) e obrigatoria. Preencha a descricao em pelo menos uma linha desse documento.`,
      };
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

/** Contagem local do CSV — sem nuvem. A confirmacao na tela nao pode esperar o catalogo. */
export function previewImportacaoDocumentosCsv(
  text: string,
): { ok: true; linhaCount: number } | { ok: false; error: string } {
  const cabErr = mensagemSeCabecalhoImportCsvIncompativel('documentos', text);
  if (cabErr) return { ok: false, error: cabErr };
  const parsed = parseCsvToRecords(text);
  if (!parsed || parsed.rows.length === 0) {
    return { ok: false, error: 'CSV invalido ou sem linhas de dados.' };
  }
  return { ok: true, linhaCount: parsed.rows.length };
}

/** Numero+revisao distintos do CSV, para o aviso de revisao antiga (depois da confirmacao ja visivel). */
export function extrairChavesDocumentosDoCsv(text: string): Array<{ numero: string; revisao: string }> {
  const parsed = parseCsvToRecords(text);
  if (!parsed) return [];
  const seen = new Set<string>();
  const chaves: Array<{ numero: string; revisao: string }> = [];
  for (const row of parsed.rows) {
    const numero = cell(row, 'numero', 'numero_documento').trim();
    if (!numero) continue;
    const revisao = cell(row, 'revisao', 'rev').trim() || 'A';
    const key = `${numero.toLowerCase()}|${revisao.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    chaves.push({ numero, revisao });
  }
  return chaves;
}

export type DescricaoDocumentoCsvLinha = {
  numero: string;
  revisao: string;
  descricao: string;
};

/**
 * Extrai descricao por documento (numero+revisao) a partir do CSV de planejamento.
 * Nao exige itens — serve para «Actualizar so descricoes» em desenhos ja existentes.
 */
export async function extrairDescricoesDocumentosDoCsv(
  text: string,
): Promise<{ ok: true; itens: DescricaoDocumentoCsvLinha[] } | { ok: false; error: string }> {
  const cabErr = mensagemSeCabecalhoImportCsvIncompativel('documentos', text);
  if (cabErr) {
    return { ok: false, error: cabErr };
  }
  const parsed = await parseCsvToRecordsCooperative(text);
  if (!parsed || parsed.rows.length === 0) {
    return { ok: false, error: 'CSV invalido ou sem linhas de dados (cabecalho obrigatorio).' };
  }

  const mapa = new Map<string, DescricaoDocumentoCsvLinha>();
  const useCooperative = parsed.rows.length >= IMPORT_COOPERATIVE_MIN_CSV_ROWS;

  for (let r = 0; r < parsed.rows.length; r++) {
    const row = parsed.rows[r];
    const numero = cell(row, 'numero', 'numero_documento').trim();
    if (!numero) {
      // Linha totalmente vazia / residual do Excel — ignorar.
      const hasAny = Object.values(row).some((v) => String(v ?? '').trim() !== '');
      if (!hasAny) continue;
      return { ok: false, error: `Linha ${r + 2}: numero e obrigatorio.` };
    }
    const revisao = cell(row, 'revisao', 'rev').trim() || 'A';
    const descricao = cell(row, 'descricao', 'descricao_documento').trim();
    const chave = `${numero.toLowerCase()}|${revisao.toLowerCase()}`;
    const prev = mapa.get(chave);
    if (!prev) {
      mapa.set(chave, { numero, revisao, descricao });
    } else if (descricao) {
      prev.descricao = descricao;
    }
    if (useCooperative) {
      await yieldCooperativeEveryRows(r);
    }
  }

  const itens = [...mapa.values()];
  const semDesc = itens.filter((i) => !i.descricao.trim());
  if (semDesc.length) {
    const amostra = semDesc
      .slice(0, 8)
      .map((i) => `${i.numero} rev. ${i.revisao}`)
      .join('; ');
    return {
      ok: false,
      error: `${semDesc.length} documento(s) sem descricao no ficheiro. Exemplos: ${amostra}`,
    };
  }
  return { ok: true, itens };
}
