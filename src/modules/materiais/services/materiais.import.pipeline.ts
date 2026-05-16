/**
 * Pipeline de importacao de materiais: Excel (CSV na pratica) -> JSON de staging -> validacao em camadas -> persistencia (servico).
 *
 * Camadas:
 * 1. Estrutural: CSV bem formado, cabecalho, delimitador
 * 2. Conversao: linha bruta -> MaterialFormData (JSON intermediario tipado)
 * 3. Negocio: validateMaterial + regras rigorosas (limites, caracteres)
 */

import { parseCsvToRecords } from '../../../lib/csv';
import { mensagemSeCabecalhoImportCsvIncompativel } from '../../../lib/csvImportHeaderGuard';
import { parseDecimalFlexible } from '../../../lib/parseDecimal';
import { validateMaterial } from '../schemas/material.schema';
import type { MaterialFormData } from '../types/material.types';
import { readMateriaisDominiosListas } from './materiaisDominios.storage';

export type MaterialImportStagingLinha = {
  /** Numero da linha no arquivo (1 = cabecalho; primeira linha de dados = 2) */
  numeroLinha: number;
  /** Celulas brutas apos parse CSV (chaves normalizadas) */
  bruto: Record<string, string>;
  /** JSON intermediario — destino logico antes do banco (sempre preenchido apos conversao) */
  formJson: MaterialFormData;
  /** Erros por camada (estrutural / conversao / negocio) */
  erros: string[];
};

export type MaterialImportStagingDocument = {
  schemaVersion: 1;
  fonte: 'excel_csv';
  geradoEm: string;
  linhas: MaterialImportStagingLinha[];
};

function parseDecimalImport(s: string): number {
  return parseDecimalFlexible(s);
}

function parseIntegerImport(s: string): number {
  const t = s.trim().replace(/\./g, '').replace(',', '.');
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : 0;
}

function parseAtivoImport(s: string): boolean {
  const t = s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  if (t === '') return true;
  if (['nao', 'n', '0', 'false', 'inativo', 'no'].includes(t)) return false;
  return true;
}

function cell(row: Record<string, string>, ...aliases: string[]): string {
  for (const key of aliases) {
    if (row[key] !== undefined && String(row[key]).trim() !== '') {
      return String(row[key]);
    }
  }
  return '';
}

/** Camada 2: linha CSV -> estrutura JSON (MaterialFormData). */
export function materialRegistroCsvParaFormData(row: Record<string, string>): MaterialFormData {
  const codigo = cell(row, 'codigo', 'codigo_material', 'material', 'sku').trim();
  const descricao = cell(row, 'descricao', 'descricao_material', 'nome').trim();
  const diametro = cell(row, 'diametro', 'diam').trim();
  const disciplina = cell(row, 'disciplina', 'disc').trim();
  const unidade = cell(row, 'unidade', 'um', 'un').trim() || 'UN';
  const peso = parseDecimalImport(cell(row, 'peso', 'peso_kg'));
  const estoqueMinimo = parseIntegerImport(cell(row, 'estoque_minimo', 'estoque_min', 'minimo'));
  const observacao = cell(row, 'observacao', 'observacoes', 'obs').trim();
  const ativo = parseAtivoImport(cell(row, 'ativo', 'status'));
  const codigoBarras = cell(row, 'codigo_barras', 'codigobarras', 'codigo_de_barras', 'ean', 'gtin').trim();

  return {
    codigo,
    codigoBarras,
    descricao,
    diametro,
    disciplina,
    unidade,
    peso,
    estoqueMinimo,
    ativo,
    observacao,
  };
}

/** Camada 3b: regras adicionais (limites, seguranca leve contra conteudo invalido). */
export function validarImportacaoMaterialRigorosa(f: MaterialFormData): string | null {
  const MAX_COD = 160;
  const MAX_DESC = 4000;
  const MAX_OBS = 8000;
  if (f.codigo.length > MAX_COD) {
    return `Codigo acima de ${MAX_COD} caracteres.`;
  }
  if (f.descricao.length > MAX_DESC) {
    return `Descricao acima de ${MAX_DESC} caracteres.`;
  }
  if (f.observacao.length > MAX_OBS) {
    return `Observacao acima de ${MAX_OBS} caracteres.`;
  }
  if (f.codigoBarras && f.codigoBarras.length > 14) {
    return 'Codigo de barras acima de 14 caracteres.';
  }
  // eslint-disable-next-line no-control-regex -- rejeitar caracteres de controle em importacao CSV
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(`${f.codigo}${f.descricao}${f.observacao}`)) {
    return 'Caracteres de controle nao permitidos.';
  }
  return null;
}

/** Camada 3: validacao de negocio completa (schema + rigor). */
export function validarImportacaoMaterialEmCamadas(form: MaterialFormData): string[] {
  const errors: string[] = [];
  const base = validateMaterial(form);
  if (base) errors.push(base);
  const extra = validarImportacaoMaterialRigorosa(form);
  if (extra) errors.push(extra);
  return errors;
}

/**
 * Verifica se o valor coincide com algum item da lista cadastrada (trim + comparacao sem acento/caso).
 */
export function valorPermitidoNaListaDominio(valor: string, lista: string[]): boolean {
  const v = valor.trim();
  if (!v) return true;
  return lista.some((item) => v.localeCompare(item.trim(), 'pt-BR', { sensitivity: 'base' }) === 0);
}

/**
 * Valida disciplina/unidade do CSV contra as listas gravadas em Disciplinas / Unidades (localStorage).
 * Deve ser executada apos `construirDocumentoStagingImportacaoMateriais`; se retornar string, bloquear preview/importacao inteira.
 */
export function validarDominiosCadastroImportacaoMateriais(
  documento: MaterialImportStagingDocument,
): string | null {
  const { disciplinas: listaDisc, unidades: listaUnd } = readMateriaisDominiosListas();
  const disciplinasInvalidas = new Set<string>();
  const unidadesInvalidas = new Set<string>();

  for (const linha of documento.linhas) {
    const d = linha.formJson.disciplina.trim();
    if (d && !valorPermitidoNaListaDominio(d, listaDisc)) {
      disciplinasInvalidas.add(d);
    }
    const u = linha.formJson.unidade.trim();
    if (u && !valorPermitidoNaListaDominio(u, listaUnd)) {
      unidadesInvalidas.add(u);
    }
  }

  const partes: string[] = [];
  if (disciplinasInvalidas.size > 0) {
    const quoted = [...disciplinasInvalidas]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((s) => `"${s}"`);
    partes.push(
      `Disciplina(s) nao cadastrada(s): ${quoted.join(', ')}. Cadastre em Disciplinas antes de importar.`,
    );
  }
  if (unidadesInvalidas.size > 0) {
    const quoted = [...unidadesInvalidas]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((s) => `"${s}"`);
    partes.push(`Unidade(s) nao cadastrada(s): ${quoted.join(', ')}. Cadastre em Unidades antes de importar.`);
  }

  return partes.length > 0 ? partes.join(' ') : null;
}

/**
 * Constroi o documento JSON de staging a partir do texto CSV (entrada tipo Excel).
 * Nao grava no banco — apenas estrutura e validacao ate a camada de negocio.
 */
export function construirDocumentoStagingImportacaoMateriais(text: string): {
  documento: MaterialImportStagingDocument | null;
  erroEstrutural: string | null;
} {
  const cabErr = mensagemSeCabecalhoImportCsvIncompativel('materiais', text);
  if (cabErr) {
    return { documento: null, erroEstrutural: cabErr };
  }
  const parsed = parseCsvToRecords(text);
  if (!parsed || parsed.rows.length === 0) {
    return {
      documento: null,
      erroEstrutural: 'CSV invalido ou sem linhas de dados (cabecalho obrigatorio).',
    };
  }

  const linhas: MaterialImportStagingLinha[] = [];
  for (let i = 0; i < parsed.rows.length; i++) {
    const bruto = parsed.rows[i];
    const numeroLinha = i + 2;
    const formJson = materialRegistroCsvParaFormData(bruto);
    const erros: string[] = [];

    if (!formJson.codigo.trim()) {
      erros.push('Codigo obrigatorio.');
    } else {
      erros.push(...validarImportacaoMaterialEmCamadas(formJson));
    }

    linhas.push({
      numeroLinha,
      bruto,
      formJson,
      erros,
    });
  }

  const documento: MaterialImportStagingDocument = {
    schemaVersion: 1,
    fonte: 'excel_csv',
    geradoEm: new Date().toISOString(),
    linhas,
  };

  return { documento, erroEstrutural: null };
}

/** Serializa o staging para JSON (inspecao, logs, testes de integracao). */
export function serializarDocumentoStagingMateriais(doc: MaterialImportStagingDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}
