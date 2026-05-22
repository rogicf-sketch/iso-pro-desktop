import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';
import { avisarPreservacaoLocalStorageCorrupto } from '../../../lib/localStoragePreservacao';
import {
  commitIsoProSnapshotWrite,
  readIsoProSnapshotPayload,
  readIsoProSnapshotPayloadForWrite,
} from '../../../lib/isoProSnapshot';
import { mensagemSeSubstituirLocalPerderiaCadastros } from '../../../lib/localSnapshotWriteGuard';
import { hasSupabaseConfig } from '../../../lib/supabase';
import { executeWrite, withLocalFallback } from '../../../lib/service-result';
import type { PaginatedResult, ServiceResult } from '../../../types/common.types';
import { whenBusinessWriteBlockedResult } from '../../../lib/writePolicy';
import { carregarRecebimentosCompletos } from '../../recebimentos/services/recebimentos.service';
import type { Etiqueta, EtiquetaFiltro, EtiquetaFormData, EtiquetaFormato, EtiquetaListItem, EtiquetaModelo } from '../types/etiqueta.types';
import { parseEtiquetasPersistidas } from '../schemas/etiquetaPersistido.zod';

function etiquetasStorageKey(): string {
  return getScopedIsoProStorageKey('iso-pro-desktop-etiquetas');
}

function bloqueioLocalEtiquetas(tamanhoListaGravacao: number): string | null {
  return mensagemSeSubstituirLocalPerderiaCadastros([
    { storageKey: etiquetasStorageKey(), tamanhoNovaLista: tamanhoListaGravacao, nomeCurto: 'etiqueta(s)' },
  ]);
}

const seedData: Etiqueta[] = [
  {
    id: 'etq-1',
    titulo: 'Identificacao de material',
    codigo: 'TB-0001',
    descricao: 'Tubo inox 2 polegadas',
    modelo: 'industrial',
    formato: 'a4_2col',
    larguraMm: 100,
    alturaMm: 50,
    moduloOrigem: 'materiais',
    referenciaId: 'mat-tb-0001',
    quantidadeCopias: 4,
    status: 'pronta',
    criadoPor: 'Administrador',
    dataCriacao: '2026-04-03T10:00:00.000Z',
    observacoes: 'Modelo base para almoxarifado.',
  },
  {
    id: 'etq-2',
    titulo: 'Etiqueta segregacao CQ',
    codigo: 'RNC-2026-010',
    descricao: 'Material segregado aguardando tratativa',
    modelo: 'segregacao',
    formato: 'termica_80',
    larguraMm: 80,
    alturaMm: 60,
    moduloOrigem: 'qualidade',
    referenciaId: 'rnc-2026-010',
    quantidadeCopias: 2,
    status: 'impressa',
    criadoPor: 'Administrador',
    dataCriacao: '2026-04-02T14:30:00.000Z',
    observacoes: 'Emitida para area de bloqueio.',
  },
];

function readAll(): Etiqueta[] {
  const raw = localStorage.getItem(etiquetasStorageKey());
  if (!raw) {
    localStorage.setItem(etiquetasStorageKey(), JSON.stringify(seedData));
    return seedData;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const validated = parseEtiquetasPersistidas(parsed);
    if (!validated) {
      avisarPreservacaoLocalStorageCorrupto('Etiquetas', etiquetasStorageKey());
      return [];
    }
    return validated;
  } catch {
    avisarPreservacaoLocalStorageCorrupto('Etiquetas', etiquetasStorageKey());
    return [];
  }
}

function writeAll(items: Etiqueta[]) {
  localStorage.setItem(etiquetasStorageKey(), JSON.stringify(items));
}

function parseSnapshotEtiquetasRaw(raw: unknown): Etiqueta[] {
  if (!raw) return [];
  const validated = parseEtiquetasPersistidas(raw);
  return validated ?? [];
}

type SnapshotPayload = {
  etiquetas?: unknown;
};

async function writeSnapshotEtiquetas(items: Etiqueta[]): Promise<void> {
  await commitIsoProSnapshotWrite(async () => {
    const { payload: currentPayload, baselineUpdatedAt } = await readIsoProSnapshotPayloadForWrite<SnapshotPayload>();
    return {
      baselineUpdatedAt,
      nextPayload: {
        ...currentPayload,
        etiquetas: items,
        dataAtualizacao: new Date().toISOString(),
      },
    };
  });
}

/**
 * Se a nuvem nao tem etiquetas e este PC tem lista local, promove uma vez para o snapshot (nao perde cadastro antigo).
 */
async function garantirMigracaoLocalParaNuvemSeNecessario(): Promise<void> {
  if (!hasSupabaseConfig()) return;
  const local = readAll();
  if (local.length === 0) return;

  const payload = await readIsoProSnapshotPayload<SnapshotPayload>();
  const nuvem = parseSnapshotEtiquetasRaw(payload.etiquetas);
  if (nuvem.length > 0) return;

  await writeSnapshotEtiquetas(local);
}

async function readSnapshotEtiquetas(): Promise<Etiqueta[]> {
  await garantirMigracaoLocalParaNuvemSeNecessario();
  const payload = await readIsoProSnapshotPayload<SnapshotPayload>();
  return parseSnapshotEtiquetasRaw(payload.etiquetas);
}

async function loadEtiquetas(): Promise<Etiqueta[]> {
  return hasSupabaseConfig() ? await readSnapshotEtiquetas().catch(() => readAll()) : readAll();
}

/** Retorna etiquetas completas para os ids informados (ordem nao garantida). */
export async function listarEtiquetasPorIds(ids: string[]): Promise<Etiqueta[]> {
  if (!ids.length) return [];
  const set = new Set(ids);
  return (await loadEtiquetas()).filter((e) => set.has(e.id));
}

function normalizeText(value: string) {
  return value.trim();
}

function toListItem(item: Etiqueta): EtiquetaListItem {
  return {
    id: item.id,
    titulo: item.titulo,
    codigo: item.codigo,
    modelo: item.modelo,
    formato: item.formato,
    larguraMm: item.larguraMm,
    alturaMm: item.alturaMm,
    moduloOrigem: item.moduloOrigem,
    referenciaId: item.referenciaId,
    quantidadeCopias: item.quantidadeCopias,
    status: item.status,
    criadoPor: item.criadoPor,
    dataCriacao: item.dataCriacao,
  };
}

function buildSearchText(item: Etiqueta) {
  return `${item.titulo} ${item.codigo} ${item.descricao} ${item.observacoes} ${item.moduloOrigem} ${item.modelo} ${item.formato} ${item.referenciaId}`.toLowerCase();
}

/**
 * Texto expandido para busca a partir do recebimento: inclui NF com e sem prefixo "NF" e somente digitos,
 * para casar buscas como "NF-7778869" com cadastro "7778869" ou "77788.69".
 */
function textoRecebimentoExpandidoParaBusca(recebimento: { notaFiscal: string; romaneio: string; fornecedor: string }): string {
  const nf = (recebimento.notaFiscal ?? '').trim();
  const rom = (recebimento.romaneio ?? '').trim();
  const forn = (recebimento.fornecedor ?? '').trim();
  const chunks: string[] = [];
  const push = (s: string) => {
    const x = s.toLowerCase().trim();
    if (x) chunks.push(x);
  };
  push(nf);
  push(rom);
  push(forn);
  const nfDigits = nf.replace(/\D/g, '');
  if (nfDigits.length >= 4) push(nfDigits);
  const nfSemPrefixo = nf.replace(/^(nf|n\.?\s*f\.?)[\s.:_-]*/i, '').trim();
  push(nfSemPrefixo);
  return chunks.join(' ');
}

/** Verifica token no texto; se nao bater literal, tenta apenas os digitos (notas fiscais com formatos diferentes). */
function tokenCasaHaystack(token: string, haystack: string): boolean {
  const h = haystack.toLowerCase();
  const t = token.toLowerCase().trim();
  if (!t) return true;
  if (h.includes(t)) return true;
  const digitosToken = t.replace(/\D/g, '');
  if (digitosToken.length >= 4 && h.includes(digitosToken)) return true;
  return false;
}

function itemMatchesTokens(item: Etiqueta, tokens: string[], textoPorRecebimentoId: Map<string, string>): boolean {
  let extra = '';
  if (item.referenciaId && textoPorRecebimentoId.has(item.referenciaId)) {
    extra = textoPorRecebimentoId.get(item.referenciaId) ?? '';
  }
  const haystack = `${buildSearchText(item)} ${extra}`;
  return tokens.every((t) => tokenCasaHaystack(t, haystack));
}

export type EtiquetaFiltroSemPagina = Omit<EtiquetaFiltro, 'page' | 'pageSize'>;

async function aplicarFiltrosEtiquetas(filtro: EtiquetaFiltroSemPagina): Promise<Etiqueta[]> {
  let items = [...(await loadEtiquetas())];

  if (filtro.modelo !== 'todos') items = items.filter((item) => item.modelo === filtro.modelo);
  if (filtro.formato !== 'todos') items = items.filter((item) => item.formato === filtro.formato);
  if (filtro.status !== 'todos') items = items.filter((item) => item.status === filtro.status);

  const buscaRaw = filtro.busca.trim();
  if (buscaRaw) {
    const tokens = buscaRaw.toLowerCase().split(/\s+/).filter(Boolean);
    const textoPorRecebimentoId = new Map<string, string>();
    if (items.length) {
      const recebimentos = await carregarRecebimentosCompletos();
      for (const r of recebimentos) {
        textoPorRecebimentoId.set(r.id, textoRecebimentoExpandidoParaBusca(r));
      }
    }
    items = items.filter((item) => itemMatchesTokens(item, tokens, textoPorRecebimentoId));
  }

  return items.sort((a, b) => b.dataCriacao.localeCompare(a.dataCriacao));
}

/** Ids de todas as etiquetas que passam pelo filtro atual (ignora paginacao). */
export async function listarIdsEtiquetasFiltradas(filtro: EtiquetaFiltroSemPagina): Promise<string[]> {
  const items = await aplicarFiltrosEtiquetas(filtro);
  return items.map((i) => i.id);
}

export function podeAtualizarStatusEtiqueta(
  item: Pick<EtiquetaListItem, 'status'>,
  novo: Etiqueta['status'],
): string | null {
  if (item.status === novo) return 'A etiqueta ja esta neste status.';
  if (item.status === 'cancelada') return 'Etiquetas canceladas nao podem ter o status alterado.';
  if (item.status === 'impressa' && novo !== 'cancelada') {
    return 'Etiquetas impressas nao podem voltar para outro status por este fluxo.';
  }
  return null;
}

export function getEtiquetaPreset(modelo: EtiquetaModelo, formato: EtiquetaFormato) {
  if (formato === 'termica_58') return { larguraMm: 58, alturaMm: modelo === 'cartao' ? 90 : 40 };
  if (formato === 'termica_80') return { larguraMm: 80, alturaMm: modelo === 'cartao' ? 100 : 60 };
  if (formato === 'a4_1col') return { larguraMm: 190, alturaMm: modelo === 'cartao' ? 80 : 60 };
  return { larguraMm: 100, alturaMm: modelo === 'cartao' ? 70 : 50 };
}

export function validateEtiqueta(data: EtiquetaFormData): string | null {
  if (!data.titulo.trim()) return 'Informe o titulo da etiqueta.';
  if (!data.codigo.trim()) return 'Informe o codigo principal.';
  if (!data.descricao.trim()) return 'Informe a descricao.';
  if (data.quantidadeCopias <= 0) return 'Informe ao menos uma copia.';
  return null;
}

export async function listarEtiquetas(filtro: EtiquetaFiltro): Promise<ServiceResult<PaginatedResult<EtiquetaListItem>>> {
  const fallbackResult = await withLocalFallback({
    shouldTryRemote: hasSupabaseConfig(),
    loadRemote: () => readSnapshotEtiquetas(),
    loadLocal: () => readAll(),
    fallbackMessage: 'Falha ao consultar etiquetas no Supabase.',
  });

  let items = [...fallbackResult.data];
  if (filtro.modelo !== 'todos') items = items.filter((item) => item.modelo === filtro.modelo);
  if (filtro.formato !== 'todos') items = items.filter((item) => item.formato === filtro.formato);
  if (filtro.status !== 'todos') items = items.filter((item) => item.status === filtro.status);

  const buscaRaw = filtro.busca.trim();
  if (buscaRaw) {
    const tokens = buscaRaw.toLowerCase().split(/\s+/).filter(Boolean);
    const textoPorRecebimentoId = new Map<string, string>();
    if (items.length) {
      const recebimentos = await carregarRecebimentosCompletos();
      for (const r of recebimentos) {
        textoPorRecebimentoId.set(r.id, textoRecebimentoExpandidoParaBusca(r));
      }
    }
    items = items.filter((item) => itemMatchesTokens(item, tokens, textoPorRecebimentoId));
  }

  items = items.sort((a, b) => b.dataCriacao.localeCompare(a.dataCriacao));

  const start = (filtro.page - 1) * filtro.pageSize;
  const end = start + filtro.pageSize;

  return {
    success: true,
    data: {
      items: items.slice(start, end).map(toListItem),
      total: items.length,
      page: filtro.page,
      pageSize: filtro.pageSize,
    },
    meta: fallbackResult.meta,
  };
}

export async function buscarEtiquetaPorId(id: string): Promise<ServiceResult<Etiqueta>> {
  const item = (await loadEtiquetas()).find((etiqueta) => etiqueta.id === id);
  if (!item) return { success: false, error: 'Etiqueta nao encontrada.' };
  return { success: true, data: item };
}

export async function salvarEtiqueta(payload: EtiquetaFormData, currentId?: string): Promise<ServiceResult<Etiqueta>> {
  const blockedEtq = whenBusinessWriteBlockedResult<Etiqueta>();
  if (blockedEtq) return blockedEtq;

  const items = await loadEtiquetas();
  const normalized: EtiquetaFormData = {
    ...payload,
    titulo: normalizeText(payload.titulo),
    codigo: normalizeText(payload.codigo),
    descricao: normalizeText(payload.descricao),
    referenciaId: normalizeText(payload.referenciaId),
    criadoPor: normalizeText(payload.criadoPor),
    observacoes: normalizeText(payload.observacoes),
  };

  if (currentId) {
    const index = items.findIndex((item) => item.id === currentId);
    if (index === -1) return { success: false, error: 'Etiqueta nao encontrada.' };
    items[index] = { ...items[index], ...normalized };
    if (hasSupabaseConfig()) {
      const bloqueio = bloqueioLocalEtiquetas(items.length);
      if (bloqueio) return { success: false, error: bloqueio };
    }
    return executeWrite({
      shouldWriteRemote: hasSupabaseConfig(),
      writeRemote: () => writeSnapshotEtiquetas(items),
      writeLocal: () => writeAll(items),
      successData: items[index],
      fallbackMessage: 'Falha ao salvar etiqueta no Supabase.',
    });
  }

  const created: Etiqueta = {
    id: crypto.randomUUID(),
    ...normalized,
    status: 'pronta',
    dataCriacao: new Date().toISOString(),
  };
  items.push(created);
  if (hasSupabaseConfig()) {
    const bloqueio = bloqueioLocalEtiquetas(items.length);
    if (bloqueio) return { success: false, error: bloqueio };
  }
  return executeWrite({
    shouldWriteRemote: hasSupabaseConfig(),
    writeRemote: () => writeSnapshotEtiquetas(items),
    writeLocal: () => writeAll(items),
    successData: created,
    fallbackMessage: 'Falha ao salvar etiqueta no Supabase.',
  });
}

export async function atualizarStatusEtiqueta(id: string, status: Etiqueta['status']): Promise<ServiceResult<Etiqueta>> {
  const blockedStatus = whenBusinessWriteBlockedResult<Etiqueta>();
  if (blockedStatus) return blockedStatus;

  const items = await loadEtiquetas();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return { success: false, error: 'Etiqueta nao encontrada.' };
  items[index] = { ...items[index], status };
  if (hasSupabaseConfig()) {
    const bloqueio = bloqueioLocalEtiquetas(items.length);
    if (bloqueio) return { success: false, error: bloqueio };
  }
  return executeWrite({
    shouldWriteRemote: hasSupabaseConfig(),
    writeRemote: () => writeSnapshotEtiquetas(items),
    writeLocal: () => writeAll(items),
    successData: items[index],
    fallbackMessage: 'Falha ao atualizar etiqueta no Supabase.',
  });
}
