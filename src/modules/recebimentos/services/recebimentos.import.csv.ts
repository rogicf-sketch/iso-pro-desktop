/**
 * Planilha Excel (CSV): uma linha por item; colunas do cabecalho do recebimento repetidas.
 * Agrupa por fornecedor + data + nota + romaneio e monta JSON compativel com importarRecebimentosDoArquivoJson.
 */

import { escapeCsvCellSemicolon, parseCsvToRecords } from '../../../lib/csv';
import { normalizarDataFlexivelParaIso } from '../../../lib/normalizeFlexibleDateToIso';
import { parseDecimalFlexible } from '../../../lib/parseDecimal';
import type { RecebimentoItem } from '../types/recebimento.types';

function cell(row: Record<string, string>, ...aliases: string[]): string {
  for (const key of aliases) {
    if (row[key] !== undefined && String(row[key]).trim() !== '') {
      return String(row[key]);
    }
  }
  return '';
}

function parseDecimal(s: string): number {
  return parseDecimalFlexible(s);
}

/** Deriva peso unitario/total a partir do CSV (permite so um dos dois). */
function resolverPesosLinha(qRec: number, puRaw: number, ptRaw: number): { pesoUnitario: number; pesoTotal: number } {
  let pu = puRaw;
  let pt = ptRaw;
  if (pt <= 0 && qRec > 0 && pu > 0) pt = qRec * pu;
  if (pu <= 0 && qRec > 0 && pt > 0) pu = pt / qRec;
  return {
    pesoUnitario: Number((pu || 0).toFixed(3)),
    pesoTotal: Number((pt || 0).toFixed(3)),
  };
}

function normalizeModo(s: string): 'direto' | 'aguardando_conferencia' {
  const t = s.trim().toLowerCase();
  if (t === 'aguardando_conferencia' || t === 'conferencia' || t === 'aguardando') {
    return 'aguardando_conferencia';
  }
  return 'direto';
}

type GrupoAcumulador = {
  fornecedor: string;
  dataRecebimento: string;
  notaFiscal: string;
  romaneio: string;
  conferente: string;
  modoRecebimento: 'direto' | 'aguardando_conferencia';
  observacoes: string;
  itensPorCodigo: Map<string, RecebimentoItem>;
};

export function construirJsonImportacaoRecebimentosPlanoCsv(
  text: string,
): { ok: true; json: string } | { ok: false; error: string } {
  const parsed = parseCsvToRecords(text);
  if (!parsed || parsed.rows.length === 0) {
    return { ok: false, error: 'CSV invalido ou sem linhas de dados (cabecalho obrigatorio).' };
  }

  const grupos = new Map<string, GrupoAcumulador>();

  for (let r = 0; r < parsed.rows.length; r++) {
    const row = parsed.rows[r];
    const fornecedor = cell(row, 'fornecedor', 'fornecedor_nome').trim();
    const dataRecebimentoRaw = cell(row, 'data_recebimento', 'data', 'datarecebimento').trim();
    const dataRecebimento = normalizarDataFlexivelParaIso(dataRecebimentoRaw) || dataRecebimentoRaw;
    const notaFiscal = cell(row, 'nota_fiscal', 'nota', 'nf').trim();
    const romaneio = cell(row, 'romaneio').trim();

    if (!fornecedor || !dataRecebimento || (!notaFiscal && !romaneio)) {
      return {
        ok: false,
        error: `Linha ${r + 2}: fornecedor, data_recebimento e (nota_fiscal ou romaneio) sao obrigatorios.`,
      };
    }
    const conferente = cell(row, 'conferente', 'conferente_nome').trim();
    const modoRecebimento = normalizeModo(cell(row, 'modo_recebimento', 'modo'));
    const observacoes = cell(row, 'observacoes', 'observacao', 'obs').trim();

    const chaveGrupo = `${fornecedor.toLowerCase()}|${dataRecebimento}|${notaFiscal.toLowerCase()}|${romaneio.toLowerCase()}`;

    if (!grupos.has(chaveGrupo)) {
      grupos.set(chaveGrupo, {
        fornecedor,
        dataRecebimento,
        notaFiscal,
        romaneio,
        conferente,
        modoRecebimento,
        observacoes,
        itensPorCodigo: new Map(),
      });
    } else if (observacoes) {
      const g = grupos.get(chaveGrupo)!;
      g.observacoes = observacoes;
      if (conferente) g.conferente = conferente;
      g.modoRecebimento = modoRecebimento;
    }

    const g = grupos.get(chaveGrupo)!;

    const codigoMaterial = cell(row, 'codigo', 'codigo_material').trim();
    const descricaoMaterial = cell(row, 'descricao', 'descricao_material').trim();
    const unidade = cell(row, 'unidade', 'um').trim() || 'UN';
    const disciplina = cell(row, 'disciplina').trim();
    const localizacao = cell(
      row,
      'localizacao',
      'localizacao_material',
      'endereco_estoque',
      'locacao',
      'loc',
    ).trim();
    const qRec = parseDecimal(cell(row, 'quantidade', 'quantidade_recebida', 'qtd_recebida'));
    const qConf = parseDecimal(cell(row, 'quantidade_conferida', 'qtd_conferida'));
    const puIn = parseDecimal(cell(row, 'peso_unitario', 'peso_unit'));
    const ptIn = parseDecimal(cell(row, 'peso_total', 'peso_total_linha'));
    const certificado = cell(row, 'certificado', 'cert', 'cert_material').trim();

    if (!codigoMaterial || !descricaoMaterial) {
      return {
        ok: false,
        error: `Linha ${r + 2}: codigo e descricao sao obrigatorios em cada linha de item.`,
      };
    }
    if (!localizacao) {
      return {
        ok: false,
        error: `Linha ${r + 2}: localizacao e obrigatoria em cada linha de item.`,
      };
    }

    const ck = codigoMaterial.toLowerCase();
    const existente = g.itensPorCodigo.get(ck);
    const linhaPeso = resolverPesosLinha(qRec, puIn, ptIn);
    if (existente) {
      existente.quantidadeRecebida += qRec;
      existente.quantidadeConferida += qConf;
      if (!existente.localizacao.trim() && localizacao) existente.localizacao = localizacao;
      if (certificado && !existente.certificado?.trim()) existente.certificado = certificado;
      const newQtd = existente.quantidadeRecebida;
      const mergedPt = (existente.pesoTotal ?? 0) + linhaPeso.pesoTotal;
      existente.pesoTotal = Number(mergedPt.toFixed(3));
      existente.pesoUnitario = newQtd > 0 ? Number((existente.pesoTotal / newQtd).toFixed(3)) : 0;
    } else {
      g.itensPorCodigo.set(ck, {
        id: `csv-item-${chaveGrupo}-${ck}-${g.itensPorCodigo.size}`,
        codigoMaterial,
        descricaoMaterial,
        unidade,
        disciplina,
        localizacao,
        quantidadeRecebida: qRec,
        quantidadeConferida: qConf,
        pesoUnitario: linhaPeso.pesoUnitario,
        pesoTotal: linhaPeso.pesoTotal,
        certificado,
      });
    }
  }

  const recebimentos = [...grupos.values()].map((gr) => ({
    fornecedor: gr.fornecedor,
    dataRecebimento: gr.dataRecebimento,
    notaFiscal: gr.notaFiscal,
    romaneio: gr.romaneio,
    conferente: gr.conferente,
    modoRecebimento: gr.modoRecebimento,
    observacoes: gr.observacoes,
    itens: [...gr.itensPorCodigo.values()],
  }));

  const payload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    recebimentos,
  };

  return { ok: true, json: JSON.stringify(payload) };
}

/** Pre-visualizacao antes de confirmar importacao em massa na lista de recebimentos. */
export function previewImportacaoRecebimentosCsv(
  text: string,
): { ok: true; linhaCount: number; recebimentoCount: number } | { ok: false; error: string } {
  const built = construirJsonImportacaoRecebimentosPlanoCsv(text);
  if (!built.ok) {
    return { ok: false, error: built.error };
  }
  let recebimentoCount = 0;
  try {
    const j = JSON.parse(built.json) as { recebimentos?: unknown[] };
    recebimentoCount = Array.isArray(j.recebimentos) ? j.recebimentos.length : 0;
  } catch {
    return { ok: false, error: 'Falha ao analisar o plano de importacao.' };
  }
  if (recebimentoCount === 0) {
    return {
      ok: false,
      error: 'Nenhum recebimento encontrado no arquivo (verifique fornecedor, data e NF ou romaneio por linha).',
    };
  }
  const parsed = parseCsvToRecords(text);
  if (!parsed || parsed.rows.length === 0) {
    return { ok: false, error: 'CSV sem linhas de dados.' };
  }
  return { ok: true, linhaCount: parsed.rows.length, recebimentoCount };
}

/**
 * CSV apenas de linhas de item (sem cabecalho do recebimento).
 * Formato principal: codigo, descricao, quantidade, unidade, localizacao, certificado (opcional).
 * Colunas legadas ainda aceitas: codigo_material, descricao_material, quantidade_recebida, disciplina, quantidade_conferida, pesos.
 * Mesmo codigo repetido no arquivo: quantidades somadas (mesma regra do import completo).
 */
export function parseItensRecebimentoCsv(
  text: string,
): { ok: true; itens: RecebimentoItem[] } | { ok: false; error: string } {
  const parsed = parseCsvToRecords(text);
  if (!parsed || parsed.rows.length === 0) {
    return { ok: false, error: 'CSV invalido ou sem linhas de dados (cabecalho obrigatorio).' };
  }

  const itensPorCodigo = new Map<string, RecebimentoItem>();

  for (let r = 0; r < parsed.rows.length; r++) {
    const row = parsed.rows[r];
    const codigoMaterial = cell(row, 'codigo', 'codigo_material').trim();
    const descricaoMaterial = cell(row, 'descricao', 'descricao_material').trim();
    const unidade = cell(row, 'unidade', 'um').trim() || 'UN';
    const disciplina = cell(row, 'disciplina').trim();
    const localizacao = cell(
      row,
      'localizacao',
      'localizacao_material',
      'endereco_estoque',
      'locacao',
      'loc',
    ).trim();
    const qRec = parseDecimal(cell(row, 'quantidade', 'quantidade_recebida', 'qtd_recebida'));
    const qConf = parseDecimal(cell(row, 'quantidade_conferida', 'qtd_conferida'));
    const puIn = parseDecimal(cell(row, 'peso_unitario', 'peso_unit'));
    const ptIn = parseDecimal(cell(row, 'peso_total', 'peso_total_linha'));
    const certificado = cell(row, 'certificado', 'cert', 'cert_material').trim();

    if (!codigoMaterial || !descricaoMaterial) {
      return {
        ok: false,
        error: `Linha ${r + 2}: codigo e descricao sao obrigatorios em cada linha.`,
      };
    }
    if (!localizacao) {
      return {
        ok: false,
        error: `Linha ${r + 2}: localizacao e obrigatoria em cada linha.`,
      };
    }

    const ck = codigoMaterial.toLowerCase();
    const existente = itensPorCodigo.get(ck);
    const linhaPeso = resolverPesosLinha(qRec, puIn, ptIn);
    if (existente) {
      existente.quantidadeRecebida += qRec;
      existente.quantidadeConferida += qConf;
      if (!existente.localizacao.trim() && localizacao) existente.localizacao = localizacao;
      if (certificado && !existente.certificado?.trim()) existente.certificado = certificado;
      const newQtd = existente.quantidadeRecebida;
      const mergedPt = (existente.pesoTotal ?? 0) + linhaPeso.pesoTotal;
      existente.pesoTotal = Number(mergedPt.toFixed(3));
      existente.pesoUnitario = newQtd > 0 ? Number((existente.pesoTotal / newQtd).toFixed(3)) : 0;
    } else {
      itensPorCodigo.set(ck, {
        id: crypto.randomUUID(),
        codigoMaterial,
        descricaoMaterial,
        unidade,
        disciplina,
        localizacao,
        quantidadeRecebida: qRec,
        quantidadeConferida: qConf,
        pesoUnitario: linhaPeso.pesoUnitario,
        pesoTotal: linhaPeso.pesoTotal,
        certificado,
      });
    }
  }

  return { ok: true, itens: [...itensPorCodigo.values()] };
}

/** Leitura previa (contagem de linhas de dados) antes de confirmar importacao na UI. */
export function previewItensRecebimentoCsv(
  text: string,
): { ok: true; linhaCount: number } | { ok: false; error: string } {
  const check = parseItensRecebimentoCsv(text);
  if (!check.ok) {
    return { ok: false, error: check.error };
  }
  const parsed = parseCsvToRecords(text);
  if (!parsed || parsed.rows.length === 0) {
    return { ok: false, error: 'CSV invalido ou sem linhas de dados.' };
  }
  return { ok: true, linhaCount: parsed.rows.length };
}

/** Mescla itens ja digitados com os importados; mesmo codigo soma quantidades. */
export function mergeItensRecebimentoComImportacao(
  existing: RecebimentoItem[],
  imported: RecebimentoItem[],
): RecebimentoItem[] {
  const placeholders = existing.filter((i) => !i.codigoMaterial.trim());
  const map = new Map<string, RecebimentoItem>();

  for (const it of existing) {
    const k = it.codigoMaterial.trim().toLowerCase();
    if (!k) continue;
    if (!map.has(k)) {
      map.set(k, { ...it });
    }
  }

  for (const it of imported) {
    const k = it.codigoMaterial.trim().toLowerCase();
    const prev = map.get(k);
    if (prev) {
      const newQtd = prev.quantidadeRecebida + it.quantidadeRecebida;
      const mergedPt = (prev.pesoTotal ?? 0) + (it.pesoTotal ?? 0);
      map.set(k, {
        ...prev,
        localizacao: it.localizacao.trim() ? it.localizacao.trim() : prev.localizacao,
        certificado: (prev.certificado?.trim() || it.certificado?.trim() || '').trim(),
        quantidadeRecebida: newQtd,
        quantidadeConferida: prev.quantidadeConferida + it.quantidadeConferida,
        pesoTotal: Number(mergedPt.toFixed(3)),
        pesoUnitario: newQtd > 0 ? Number((mergedPt / newQtd).toFixed(3)) : 0,
      });
    } else {
      map.set(k, { ...it, id: crypto.randomUUID() });
    }
  }

  return [...map.values(), ...placeholders];
}

/**
 * CSV modelo para importacao em massa: repete fornecedor/NF/romaneio em cada linha de material.
 * Colunas de item: codigo, descricao, quantidade, unidade, localizacao, certificado (opcional).
 * Separador `;`, UTF-8 com BOM — compativel com Excel em portugues.
 */
export function montarModeloCsvImportacaoRecebimentos(): { csv: string; fileName: string } {
  const sep = ';';
  const header = [
    'fornecedor',
    'data_recebimento',
    'nota_fiscal',
    'romaneio',
    'conferente',
    'modo_recebimento',
    'observacoes',
    'codigo',
    'descricao',
    'quantidade',
    'unidade',
    'localizacao',
    'certificado',
  ];
  const rows: string[][] = [
    [
      'Metal Forte',
      '2026-04-02',
      'NF-778810',
      'ROM-100',
      'Carlos Lima',
      'aguardando_conferencia',
      '',
      'TB-0001',
      'Tubo inox 2 polegadas',
      '12',
      'UN',
      'A-01',
      '',
    ],
    [
      'Metal Forte',
      '2026-04-02',
      'NF-778810',
      'ROM-100',
      'Carlos Lima',
      'aguardando_conferencia',
      '',
      'EL-0102',
      'Cabo eletrico 10mm',
      '200',
      'M',
      'B-EST-03',
      '',
    ],
    [
      'Cabos Brasil',
      '2026-04-01',
      'NF-778811',
      'ROM-101',
      'Mariana Costa',
      'direto',
      'Segundo recebimento no mesmo arquivo — modo direto',
      'EL-0102',
      'Cabo eletrico 10mm',
      '100',
      'M',
      'B-EST-03',
      'CERT-2026-001',
    ],
  ];
  const lines = [
    header.join(sep),
    ...rows.map((r) => r.map((c) => escapeCsvCellSemicolon(c)).join(sep)),
  ];
  const csv = `\uFEFF${lines.join('\r\n')}\r\n`;
  return { csv, fileName: 'iso-pro-recebimentos-modelo-importacao.csv' };
}

/**
 * Modelo so de linhas de material (para Importar itens no Novo recebimento).
 * Cabecalho: codigo;descricao;quantidade;unidade;localizacao;certificado
 */
export function montarModeloCsvImportacaoRecebimentosItens(): { csv: string; fileName: string } {
  const sep = ';';
  const header = ['codigo', 'descricao', 'quantidade', 'unidade', 'localizacao', 'certificado'];
  const rows: string[][] = [
    ['TB-0001', 'Tubo inox 2 polegadas', '12', 'UN', 'A-01', ''],
    ['EL-0102', 'Cabo eletrico 10mm', '200', 'M', 'B-EST-03', 'CERT-2026-001'],
  ];
  const lines = [
    header.join(sep),
    ...rows.map((r) => r.map((c) => escapeCsvCellSemicolon(c)).join(sep)),
  ];
  const csv = `\uFEFF${lines.join('\r\n')}\r\n`;
  return { csv, fileName: 'iso-pro-recebimentos-modelo-itens-importacao.csv' };
}
