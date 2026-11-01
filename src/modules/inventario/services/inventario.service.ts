import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';
import { escapeCsvCellSemicolon, formatDecimalExcelPtBr } from '../../../lib/csv';
import { hasSupabaseConfig } from '../../../lib/supabase';
import {
  listInventariosPageFromCloud,
  readInventarioFromCloud,
  writeInventariosSotOnCloud,
} from '../../../lib/inventariosTabelas';
import {
  invalidateIsoProSnapshotCache,
  isIsoProSnapshotConflictError,
  readIsoProSnapshotSlicesForWrite,
} from '../../../lib/isoProSnapshot';
import { assertNoSilentSotFallback } from '../../../lib/sotWriteGuard';
import { readSnapshotRemoteSliceOrFull } from '../../../lib/snapshotSliceRead';
import { executeWrite, withLocalFallback } from '../../../lib/service-result';
import {
  REMOTE_READ_PREFER_MS,
  REMOTE_READ_TIMEOUT_MS,
  shouldTryRemoteRead,
  withRemoteReadTimeout,
} from '../../../lib/dataReadPolicy';
import type { PaginatedResult, ServiceResult } from '../../../types/common.types';
import type { Inventario, InventarioFiltro, InventarioFormData, InventarioListItem } from '../types/inventario.types';
import { avisarPreservacaoLocalStorageCorrupto } from '../../../lib/localStoragePreservacao';
import { parseInventariosPersistidos } from '../schemas/inventarioPersistido.zod';
import { getCurrentUser } from '../../auth/services/auth.service';
import { appendAuthAuditEvent } from '../../auth/services/authAudit.service';

function inventariosStorageKey(): string {
  return getScopedIsoProStorageKey('iso-pro-desktop-inventarios');
}

function resumoAuditoriaInventario(
  inv: Pick<
    Inventario,
    'id' | 'codigo' | 'descricao' | 'responsavel' | 'dataInventario' | 'status' | 'contagemMobileHabilitada' | 'itens'
  >,
) {
  return {
    id: inv.id,
    codigo: inv.codigo,
    descricao: inv.descricao,
    responsavel: inv.responsavel,
    dataInventario: inv.dataInventario,
    status: inv.status,
    contagemMobileHabilitada: inv.contagemMobileHabilitada,
    totalItens: inv.itens?.length ?? 0,
    divergencias: (inv.itens ?? []).filter((it) => it.quantidadeContada !== it.saldoSistema).length,
  };
}

function auditarInventarioSalvo(before: Inventario | undefined, after: Inventario) {
  const actorLogin = getCurrentUser()?.login?.trim() || 'desconhecido';
  if (before) {
    appendAuthAuditEvent({
      type: 'inventario_editado',
      actorLogin,
      detail: `Inventario editado ${after.codigo} (${after.descricao})`,
      entityType: 'inventario',
      entityId: after.id,
      before: resumoAuditoriaInventario(before),
      after: resumoAuditoriaInventario(after),
    });
    return;
  }
  appendAuthAuditEvent({
    type: 'inventario_criado',
    actorLogin,
    detail: `Inventario criado ${after.codigo} (${after.descricao}) · ${after.itens?.length ?? 0} item(ns)`,
    entityType: 'inventario',
    entityId: after.id,
    after: resumoAuditoriaInventario(after),
  });
}

function auditarInventarioFechado(before: Inventario, after: Inventario) {
  appendAuthAuditEvent({
    type: 'inventario_fechado',
    actorLogin: getCurrentUser()?.login?.trim() || 'desconhecido',
    detail: `Inventario fechado ${after.codigo} (${after.descricao})`,
    entityType: 'inventario',
    entityId: after.id,
    before: resumoAuditoriaInventario(before),
    after: resumoAuditoriaInventario(after),
  });
}

const seedData: Inventario[] = [
  {
    id: 'inv-1',
    codigo: 'INV-2026-001',
    descricao: 'Inventario geral almoxarifado central (exemplo)',
    responsavel: 'Carlos Lima',
    dataInventario: '2026-04-01',
    status: 'aberto',
    contagemMobileHabilitada: true,
    observacoes: 'Exemplo de fabrica — some desta vista quando houver inventarios gravados no Supabase.',
    itens: [
      {
        id: 'inv-1-item-1',
        codigoMaterial: 'TB-0001',
        descricaoMaterial: 'Tubo inox 2 polegadas',
        unidade: 'UN',
        saldoSistema: 12,
        quantidadeContada: 10,
        localizacaoContada: '',
      },
      {
        id: 'inv-1-item-2',
        codigoMaterial: 'EL-0102',
        descricaoMaterial: 'Cabo eletrico 10mm',
        unidade: 'M',
        saldoSistema: 200,
        quantidadeContada: 205,
        localizacaoContada: '',
      },
    ],
  },
  {
    id: 'inv-2',
    codigo: 'INV-2026-000',
    descricao: 'Inventario rotativo eletrica (exemplo fechado — exportar CSV)',
    responsavel: 'Mariana Costa',
    dataInventario: '2026-03-28',
    status: 'fechado',
    contagemMobileHabilitada: false,
    observacoes: 'Exemplo de fabrica fechado — use Exportar Excel (CSV) na linha para testar.',
    itens: [
      {
        id: 'inv-2-item-1',
        codigoMaterial: 'EL-0010',
        descricaoMaterial: 'Terminal eletrico',
        unidade: 'UN',
        saldoSistema: 80,
        quantidadeContada: 80,
        localizacaoContada: '',
      },
    ],
  },
];

const DEMO_INVENTARIO_IDS = new Set(seedData.map((i) => i.id));

function isSomenteSeedDemo(items: Inventario[]): boolean {
  return items.length > 0 && items.every((i) => DEMO_INVENTARIO_IDS.has(i.id));
}

function localInventariosPareceSeedOuVazio(items: Inventario[]): boolean {
  return items.length === 0 || isSomenteSeedDemo(items);
}

function readAll(): Inventario[] {
  const raw = localStorage.getItem(inventariosStorageKey());
  if (!raw) {
    if (hasSupabaseConfig()) return [];
    localStorage.setItem(inventariosStorageKey(), JSON.stringify(seedData));
    return seedData;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const validated = parseInventariosPersistidos(parsed);
    if (!validated) {
      avisarPreservacaoLocalStorageCorrupto('Inventario', inventariosStorageKey());
      return [];
    }
    if (hasSupabaseConfig() && isSomenteSeedDemo(validated)) {
      localStorage.removeItem(inventariosStorageKey());
      return [];
    }
    return validated;
  } catch {
    avisarPreservacaoLocalStorageCorrupto('Inventario', inventariosStorageKey());
    return [];
  }
}

function writeAll(items: Inventario[]) {
  localStorage.setItem(inventariosStorageKey(), JSON.stringify(items));
}

/**
 * Leitura para listagem, detalhe e exportacao.
 * Com Supabase: prioriza nuvem; se local vazio/seed, espera timeout completo (evita demos na UI/save).
 */
async function loadInventarios(): Promise<Inventario[]> {
  if (!hasSupabaseConfig()) return readAll();

  if (!shouldTryRemoteRead()) {
    void (async () => {
      try {
        const remote = await withRemoteReadTimeout(() => readSnapshotInventarios(), REMOTE_READ_TIMEOUT_MS);
        if (remote.length > 0) writeAll(remote);
      } catch {
        /* sync suave — ignorar */
      }
    })();
    return readAll();
  }

  const localNow = readAll();
  const preferMs = localInventariosPareceSeedOuVazio(localNow) ? REMOTE_READ_TIMEOUT_MS : undefined;
  const fallback = await withLocalFallback({
    shouldTryRemote: true,
    loadRemote: async () => {
      const remote = await readSnapshotInventarios();
      // Nuvem vazia: nao promover seed demo. Espelhar [] limpa demos locais.
      if (remote.length > 0 || localInventariosPareceSeedOuVazio(localNow)) {
        writeAll(remote);
      }
      return remote;
    },
    loadLocal: () => readAll(),
    fallbackMessage: 'Falha ao consultar inventarios no Supabase.',
    preferMs,
  });
  return fallback.data;
}

/** Pagina local sincrona para initialData do React Query (SWR). */
export function listarInventariosLocalSync(
  filtro: InventarioFiltro,
): { items: InventarioListItem[]; total: number } {
  let items = readAll();
  if (filtro.busca.trim()) {
    const busca = filtro.busca.trim().toLowerCase();
    items = items.filter((item) => buildSearchText(item).includes(busca));
  }
  if (filtro.status !== 'todos') {
    items = items.filter((item) => item.status === filtro.status);
  }
  items = [...items].sort((a, b) => b.dataInventario.localeCompare(a.dataInventario));
  const start = (filtro.page - 1) * filtro.pageSize;
  const end = start + filtro.pageSize;
  return {
    items: items.slice(start, end).map(toListItem),
    total: items.length,
  };
}

function normalizeLookupValue(value: string) {
  return value.trim().toLowerCase();
}

type SnapshotPayload = {
  inventarios?: Array<{
    id?: string | number;
    codigo?: string;
    descricao?: string;
    responsavel?: string;
    dataInventario?: string;
    status?: 'aberto' | 'fechado' | 'cancelado';
    contagemMobileHabilitada?: boolean;
    observacoes?: string;
    itens?: Array<{
      id?: string | number;
      codigoMaterial?: string;
      descricaoMaterial?: string;
      unidade?: string;
      saldoSistema?: number;
      quantidadeContada?: number;
      localizacaoContada?: string;
    }>;
  }>;
};

async function readSnapshotInventarios(): Promise<Inventario[]> {
  const payload = await readSnapshotRemoteSliceOrFull<SnapshotPayload>(['inventarios']);
  return (payload.inventarios ?? []).map((inv, index) => ({
    id: String(inv.id ?? `inv-${index + 1}`),
    codigo: String(inv.codigo ?? ''),
    descricao: String(inv.descricao ?? ''),
    responsavel: String(inv.responsavel ?? ''),
    dataInventario: String(inv.dataInventario ?? new Date().toISOString().slice(0, 10)),
    status: inv.status ?? 'aberto',
    contagemMobileHabilitada: Boolean(inv.contagemMobileHabilitada),
    observacoes: String(inv.observacoes ?? ''),
    itens: (inv.itens ?? []).map((item, itemIndex) => ({
      id: String(item.id ?? `${inv.id ?? index}-item-${itemIndex + 1}`),
      codigoMaterial: String(item.codigoMaterial ?? ''),
      descricaoMaterial: String(item.descricaoMaterial ?? ''),
      unidade: String(item.unidade ?? 'UN'),
      saldoSistema: Number(item.saldoSistema ?? 0),
      quantidadeContada: Number(item.quantidadeContada ?? 0),
      localizacaoContada: String(item.localizacaoContada ?? '').trim(),
    })),
  }));
}

function inventariosToSnapshotWire(items: Inventario[]) {
  return items.map((item) => ({
    id: item.id,
    codigo: item.codigo,
    descricao: item.descricao,
    responsavel: item.responsavel,
    dataInventario: item.dataInventario,
    status: item.status,
    contagemMobileHabilitada: item.contagemMobileHabilitada,
    observacoes: item.observacoes,
    itens: item.itens.map((invItem) => ({
      id: invItem.id,
      codigoMaterial: invItem.codigoMaterial,
      descricaoMaterial: invItem.descricaoMaterial,
      unidade: invItem.unidade,
      saldoSistema: invItem.saldoSistema,
      quantidadeContada: invItem.quantidadeContada,
      localizacaoContada: invItem.localizacaoContada ?? '',
    })),
  }));
}

/**
 * SoT table-first: `iso_pro_write_inventarios_sot` (upsert / remove / replace_all).
 * Preferir upsert de 1 inventario — nunca replace_all no fluxo normal (100k-safe).
 */
export type SnapshotInventariosWrite =
  | { upsert: Inventario[] }
  | { replaceAll: Inventario[] }
  | { removeIds: string[] };

async function writeSnapshotInventarios(write: SnapshotInventariosWrite): Promise<void> {
  const maxAttempts = 5;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const { baselineUpdatedAt } = await readIsoProSnapshotSlicesForWrite(['inventarios']);
      const sot = await writeInventariosSotOnCloud({
        baselineUpdatedAt,
        upsert: 'upsert' in write ? inventariosToSnapshotWire(write.upsert) : null,
        removeIds: 'removeIds' in write ? write.removeIds : null,
        replaceAll: 'replaceAll' in write ? inventariosToSnapshotWire(write.replaceAll) : null,
      });
      assertNoSilentSotFallback('inventarios', sot.missing);
      invalidateIsoProSnapshotCache();
      return;
    } catch (error) {
      lastError = error;
      if (isIsoProSnapshotConflictError(error) && attempt < maxAttempts - 1) {
        invalidateIsoProSnapshotCache();
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Falha ao gravar inventarios na nuvem.');
}

function mapCloudRowToInventario(row: Record<string, unknown>, fallbackId: string): Inventario {
  const statusRaw = String(row.status ?? 'aberto');
  const status = (
    statusRaw === 'fechado' || statusRaw === 'cancelado' ? statusRaw : 'aberto'
  ) as Inventario['status'];
  const itensRaw = Array.isArray(row.itens) ? row.itens : [];
  const id = String(row.id ?? fallbackId);
  return {
    id,
    codigo: String(row.codigo ?? ''),
    descricao: String(row.descricao ?? ''),
    responsavel: String(row.responsavel ?? ''),
    dataInventario: String(row.dataInventario ?? new Date().toISOString().slice(0, 10)),
    status,
    contagemMobileHabilitada: Boolean(row.contagemMobileHabilitada),
    observacoes: String(row.observacoes ?? ''),
    itens: itensRaw.map((raw, itemIndex) => {
      const item = raw as Record<string, unknown>;
      return {
        id: String(item.id ?? `${id}-item-${itemIndex + 1}`),
        codigoMaterial: String(item.codigoMaterial ?? ''),
        descricaoMaterial: String(item.descricaoMaterial ?? ''),
        unidade: String(item.unidade ?? 'UN'),
        saldoSistema: Number(item.saldoSistema ?? 0),
        quantidadeContada: Number(item.quantidadeContada ?? 0),
        localizacaoContada: String(item.localizacaoContada ?? '').trim(),
      };
    }),
  };
}

/** Duplicata de codigo sem baixar fatia inventarios[] completa. */
async function existeInventarioCodigoNasTabelas(
  codigo: string,
  excludeId?: string,
): Promise<boolean> {
  const page = await listInventariosPageFromCloud({
    busca: codigo.trim(),
    offset: 0,
    limit: 20,
    status: 'todos',
  });
  if (page.error || page.source !== 'tables') return false;
  const want = normalizeLookupValue(codigo);
  return page.inventarios.some((row) => {
    const id = String(row.id ?? '');
    if (excludeId && id === excludeId) return false;
    return normalizeLookupValue(String(row.codigo ?? '')) === want;
  });
}

function buildSearchText(item: Inventario) {
  return `${item.codigo} ${item.descricao} ${item.responsavel}`.toLowerCase();
}

function normalizeInventarioPayload(payload: InventarioFormData): InventarioFormData {
  return {
    ...payload,
    codigo: payload.codigo.trim(),
    descricao: payload.descricao.trim(),
    responsavel: payload.responsavel.trim(),
    contagemMobileHabilitada: Boolean(payload.contagemMobileHabilitada),
    observacoes: payload.observacoes.trim(),
    itens: payload.itens.map((item) => ({
      ...item,
      codigoMaterial: item.codigoMaterial.trim(),
      descricaoMaterial: item.descricaoMaterial.trim(),
      unidade: item.unidade.trim(),
      saldoSistema: Number(item.saldoSistema ?? 0),
      quantidadeContada: Number(item.quantidadeContada ?? 0),
      localizacaoContada: String(item.localizacaoContada ?? '').trim(),
    })),
  };
}

function toListItem(item: Inventario): InventarioListItem {
  return {
    id: item.id,
    codigo: item.codigo,
    descricao: item.descricao,
    responsavel: item.responsavel,
    dataInventario: item.dataInventario,
    status: item.status,
    contagemMobileHabilitada: item.contagemMobileHabilitada,
    totalItens: item.itens.length,
    divergencias: item.itens.filter((current) => current.saldoSistema !== current.quantidadeContada).length,
  };
}

export function validateInventario(data: InventarioFormData): string | null {
  if (!data.codigo.trim()) return 'Informe o codigo do inventario.';
  if (!data.descricao.trim()) return 'Informe a descricao do inventario.';
  if (!data.responsavel.trim()) return 'Informe o responsavel.';
  if (!data.itens.length) return null;
  const hasInvalidItem = data.itens.some(
    (item) => !item.codigoMaterial.trim() || !item.descricaoMaterial.trim() || !item.unidade.trim() || item.saldoSistema < 0 || item.quantidadeContada < 0,
  );
  if (hasInvalidItem) return 'Revise os itens do inventario. Existem campos obrigatorios vazios ou quantidades invalidas.';

  const duplicatedCodes = new Set<string>();
  for (const item of data.itens) {
    const code = normalizeLookupValue(item.codigoMaterial);
    if (duplicatedCodes.has(code)) {
      return `Nao e permitido repetir o material ${item.codigoMaterial} no mesmo inventario.`;
    }
    duplicatedCodes.add(code);
  }

  return null;
}

function validateInventarioForClosing(item: Inventario): string | null {
  if (!item.itens.length) return 'Nao e possivel fechar um inventario sem itens.';

  const hasInvalidItem = item.itens.some(
    (current) =>
      !current.codigoMaterial.trim() ||
      !current.descricaoMaterial.trim() ||
      !current.unidade.trim() ||
      current.saldoSistema < 0 ||
      current.quantidadeContada < 0,
  );

  if (hasInvalidItem) {
    return 'Nao e possivel fechar um inventario com itens invalidos ou quantidades negativas.';
  }

  const duplicatedCodes = new Set<string>();
  for (const current of item.itens) {
    const code = normalizeLookupValue(current.codigoMaterial);
    if (duplicatedCodes.has(code)) {
      return `Nao e possivel fechar um inventario com material duplicado: ${current.codigoMaterial}.`;
    }
    duplicatedCodes.add(code);
  }

  return null;
}

export async function listarInventarios(
  filtro: InventarioFiltro,
): Promise<ServiceResult<PaginatedResult<InventarioListItem>>> {
  const localNow = readAll();
  const localPareceSeed = localInventariosPareceSeedOuVazio(localNow);
  // Com Supabase, nao servir demos na 1.a pintura enquanto a nuvem responde.
  const localPage = localPareceSeed && hasSupabaseConfig()
    ? { items: [] as InventarioListItem[], total: 0 }
    : listarInventariosLocalSync(filtro);

  // Offline: local imediato
  if (!shouldTryRemoteRead()) {
    if (hasSupabaseConfig()) {
      void withRemoteReadTimeout(
        () =>
          listInventariosPageFromCloud({
            busca: filtro.busca,
            offset: (filtro.page - 1) * filtro.pageSize,
            limit: filtro.pageSize,
            status: filtro.status,
          }),
        REMOTE_READ_TIMEOUT_MS,
      ).catch(() => undefined);
    }
    return {
      success: true,
      data: {
        items: localPage.items,
        total: localPage.total,
        page: filtro.page,
        pageSize: filtro.pageSize,
      },
      meta: { source: 'local' },
    };
  }

  // SWR — se local vazio/seed, esperar a nuvem (timeout completo)
  if (hasSupabaseConfig()) {
    const preferMs = localPareceSeed ? REMOTE_READ_TIMEOUT_MS : REMOTE_READ_PREFER_MS;
    const cloudPromise = withRemoteReadTimeout(
      () =>
        listInventariosPageFromCloud({
          busca: filtro.busca,
          offset: (filtro.page - 1) * filtro.pageSize,
          limit: filtro.pageSize,
          status: filtro.status,
        }),
      REMOTE_READ_TIMEOUT_MS,
    );

    const raced = await Promise.race([
      cloudPromise.then((page) => ({ kind: 'cloud' as const, page })),
      new Promise<{ kind: 'prefer' }>((resolve) => {
        setTimeout(() => resolve({ kind: 'prefer' }), preferMs);
      }),
    ]);

    if (raced.kind === 'cloud') {
      const page = raced.page;
      if (page.source === 'tables' && !page.error) {
        const items: InventarioListItem[] = page.inventarios.map((row) => {
          const statusRaw = String(row.status ?? 'aberto');
          const status = (
            statusRaw === 'fechado' || statusRaw === 'cancelado' ? statusRaw : 'aberto'
          ) as Inventario['status'];
          return {
            id: String(row.id ?? ''),
            codigo: String(row.codigo ?? ''),
            descricao: String(row.descricao ?? ''),
            responsavel: String(row.responsavel ?? ''),
            dataInventario: String(row.dataInventario ?? ''),
            status,
            contagemMobileHabilitada: Boolean(row.contagemMobileHabilitada),
            totalItens: Number(row.totalItens) || 0,
            divergencias: Number(row.divergencias) || 0,
          };
        });
        return {
          success: true,
          data: {
            items,
            total: page.total,
            page: filtro.page,
            pageSize: filtro.pageSize,
          },
          meta: { source: 'supabase' },
        };
      }
    } else {
      void cloudPromise.catch(() => undefined);
      return {
        success: true,
        data: {
          items: localPage.items,
          total: localPage.total,
          page: filtro.page,
          pageSize: filtro.pageSize,
        },
        meta: { source: 'local', staleWhileRevalidate: true },
      };
    }
  }

  const fallbackResult = await withLocalFallback({
    shouldTryRemote: true,
    loadRemote: async () => {
      const remote = await readSnapshotInventarios();
      if (remote.length === 0) return readAll();
      writeAll(remote);
      return remote;
    },
    loadLocal: () => readAll(),
    fallbackMessage: 'Falha ao consultar inventarios no Supabase.',
  });
  let items = fallbackResult.data;
  const { meta } = fallbackResult;

  if (filtro.busca.trim()) {
    const busca = filtro.busca.trim().toLowerCase();
    items = items.filter((item) => buildSearchText(item).includes(busca));
  }

  if (filtro.status !== 'todos') {
    items = items.filter((item) => item.status === filtro.status);
  }

  items = [...items].sort((a, b) => b.dataInventario.localeCompare(a.dataInventario));

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
    meta,
  };
}

export async function salvarInventario(
  payload: InventarioFormData,
  currentId?: string,
): Promise<ServiceResult<Inventario>> {
  if (hasSupabaseConfig()) {
    try {
      const normalized = normalizeInventarioPayload(payload);
      const validationError = validateInventario(normalized);
      if (validationError) return { success: false, error: validationError };

      // 100k-safe: duplicata via pagina + upsert de 1 — sem fatia/replace-all.
      if (await existeInventarioCodigoNasTabelas(normalized.codigo, currentId)) {
        return { success: false, error: 'Ja existe um inventario com esse codigo.' };
      }

      const localItems = readAll();

      if (currentId) {
        const cloud = await readInventarioFromCloud(currentId);
        let existing: Inventario | undefined =
          cloud.inventario != null
            ? mapCloudRowToInventario(cloud.inventario, currentId)
            : undefined;
        if (!existing) {
          const local = localItems.find((item) => item.id === currentId);
          // Nao promover seed demo quando a nuvem nao tem o inventario.
          if (local && !isSomenteSeedDemo(localItems)) existing = local;
        }
        if (!existing) return { success: false, error: 'Inventario nao encontrado.' };
        if (existing.status !== 'aberto') {
          return { success: false, error: 'Apenas inventarios em aberto podem ser editados.' };
        }
        const before = { ...existing };
        const updated: Inventario = { ...existing, ...normalized };
        const nextLocal = localItems.some((x) => x.id === currentId)
          ? localItems.map((x) => (x.id === currentId ? updated : x))
          : [...localItems, updated];
        const writeResult = await executeWrite({
          shouldWriteRemote: true,
          writeRemote: () => writeSnapshotInventarios({ upsert: [updated] }),
          writeLocal: () => writeAll(nextLocal),
          successData: updated,
          fallbackMessage: 'Falha ao salvar inventario no Supabase.',
        });
        if (writeResult.success && writeResult.data) {
          auditarInventarioSalvo(before, writeResult.data);
        }
        return writeResult;
      }

      const created: Inventario = {
        id: crypto.randomUUID(),
        status: 'aberto',
        ...normalized,
      };
      const nextLocal = [...localItems, created];
      const writeResult = await executeWrite({
        shouldWriteRemote: true,
        writeRemote: () => writeSnapshotInventarios({ upsert: [created] }),
        writeLocal: () => writeAll(nextLocal),
        successData: created,
        fallbackMessage: 'Falha ao salvar inventario no Supabase.',
      });
      if (writeResult.success && writeResult.data) {
        auditarInventarioSalvo(undefined, writeResult.data);
      }
      return writeResult;
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Falha ao salvar inventario no Supabase.' };
    }
  }

  const items = readAll();
  const normalized = normalizeInventarioPayload(payload);
  const validationError = validateInventario(normalized);
  if (validationError) return { success: false, error: validationError };
  const duplicated = items.find(
    (item) => item.id !== currentId && normalizeLookupValue(item.codigo) === normalizeLookupValue(normalized.codigo),
  );
  if (duplicated) return { success: false, error: 'Ja existe um inventario com esse codigo.' };

  if (currentId) {
    const index = items.findIndex((item) => item.id === currentId);
    if (index === -1) return { success: false, error: 'Inventario nao encontrado.' };
    if (items[index].status !== 'aberto') return { success: false, error: 'Apenas inventarios em aberto podem ser editados.' };
    const before = { ...items[index] };
    items[index] = { ...items[index], ...normalized };
    writeAll(items);
    auditarInventarioSalvo(before, items[index]);
    return { success: true, data: items[index] };
  }

  const created: Inventario = {
    id: crypto.randomUUID(),
    status: 'aberto',
    ...normalized,
  };

  items.push(created);
  writeAll(items);
  auditarInventarioSalvo(undefined, created);
  return { success: true, data: created };
}

export async function fecharInventario(id: string): Promise<ServiceResult<Inventario>> {
  if (hasSupabaseConfig()) {
    try {
      const cloud = await readInventarioFromCloud(id);
      const localItems = readAll();
      const existing =
        cloud.inventario != null
          ? mapCloudRowToInventario(cloud.inventario, id)
          : localItems.find((item) => item.id === id);
      if (!existing) return { success: false, error: 'Inventario nao encontrado.' };
      if (existing.status === 'fechado') return { success: false, error: 'Inventario ja fechado.' };
      if (existing.status === 'cancelado') return { success: false, error: 'Inventario cancelado nao pode ser fechado.' };
      const closingError = validateInventarioForClosing(existing);
      if (closingError) return { success: false, error: closingError };
      const before = { ...existing };
      const updated: Inventario = { ...existing, status: 'fechado' };
      const nextLocal = localItems.some((x) => x.id === id)
        ? localItems.map((x) => (x.id === id ? updated : x))
        : [...localItems, updated];
      const writeResult = await executeWrite({
        shouldWriteRemote: true,
        writeRemote: () => writeSnapshotInventarios({ upsert: [updated] }),
        writeLocal: () => writeAll(nextLocal),
        successData: updated,
        fallbackMessage: 'Falha ao fechar inventario no Supabase.',
      });
      if (writeResult.success && writeResult.data) {
        auditarInventarioFechado(before, writeResult.data);
      }
      return writeResult;
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Falha ao fechar inventario no Supabase.' };
    }
  }

  const items = readAll();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return { success: false, error: 'Inventario nao encontrado.' };
  if (items[index].status === 'fechado') return { success: false, error: 'Inventario ja fechado.' };
  if (items[index].status === 'cancelado') return { success: false, error: 'Inventario cancelado nao pode ser fechado.' };
  const closingError = validateInventarioForClosing(items[index]);
  if (closingError) return { success: false, error: closingError };
  const before = { ...items[index] };
  items[index] = { ...items[index], status: 'fechado' };
  writeAll(items);
  auditarInventarioFechado(before, items[index]);
  return { success: true, data: items[index] };
}

export async function buscarInventarioPorId(id: string): Promise<ServiceResult<Inventario>> {
  if (hasSupabaseConfig()) {
    try {
      const cloud = await readInventarioFromCloud(id);
      if (cloud.source === 'tables' && cloud.inventario) {
        const row = cloud.inventario;
        const statusRaw = String(row.status ?? 'aberto');
        const status = (
          statusRaw === 'fechado' || statusRaw === 'cancelado' ? statusRaw : 'aberto'
        ) as Inventario['status'];
        const itensRaw = Array.isArray(row.itens) ? row.itens : [];
        return {
          success: true,
          data: {
            id: String(row.id ?? id),
            codigo: String(row.codigo ?? ''),
            descricao: String(row.descricao ?? ''),
            responsavel: String(row.responsavel ?? ''),
            dataInventario: String(row.dataInventario ?? ''),
            status,
            contagemMobileHabilitada: Boolean(row.contagemMobileHabilitada),
            observacoes: String(row.observacoes ?? ''),
            itens: itensRaw.map((raw, itemIndex) => {
              const item = raw as Record<string, unknown>;
              return {
                id: String(item.id ?? `${id}-item-${itemIndex + 1}`),
                codigoMaterial: String(item.codigoMaterial ?? ''),
                descricaoMaterial: String(item.descricaoMaterial ?? ''),
                unidade: String(item.unidade ?? 'UN'),
                saldoSistema: Number(item.saldoSistema ?? 0),
                quantidadeContada: Number(item.quantidadeContada ?? 0),
                localizacaoContada: String(item.localizacaoContada ?? '').trim(),
              };
            }),
          },
          meta: { source: 'supabase' },
        };
      }
    } catch {
      /* fallback */
    }
  }
  const item = (await loadInventarios()).find((inventario) => inventario.id === id);
  if (!item) return { success: false, error: 'Inventario nao encontrado.' };
  return { success: true, data: item };
}

function sanitizeInventarioExportFileSegment(codigo: string): string {
  const illegalFileNameChar = /[<>:"/\\|?*]/;
  let out = '';
  for (const ch of codigo.trim()) {
    const code = ch.charCodeAt(0);
    if (code < 32 || illegalFileNameChar.test(ch)) {
      out += '_';
    } else {
      out += ch;
    }
  }
  return out.length > 0 ? out : 'inventario';
}

/**
 * CSV com separador `;` e BOM UTF-8 para abrir no Excel (português).
 * Somente inventários com status `fechado`.
 */
export async function montarExportacaoInventarioCsv(id: string): Promise<ServiceResult<{ csv: string; fileName: string }>> {
  const loaded = await buscarInventarioPorId(id);
  if (!loaded.success || !loaded.data) {
    return { success: false, error: loaded.error ?? 'Inventario nao encontrado.' };
  }
  const inv = loaded.data;
  if (inv.status !== 'fechado') {
    return { success: false, error: 'Apenas inventarios fechados podem ser exportados.' };
  }
  if (!inv.itens.length) {
    return { success: false, error: 'Inventario sem itens para exportar.' };
  }

  const header = [
    'inventario_codigo',
    'inventario_descricao',
    'inventario_responsavel',
    'inventario_data',
    'inventario_status',
    'contagem_mobile',
    'inventario_observacoes',
    'codigo_material',
    'descricao_material',
    'unidade',
    'saldo_sistema',
    'quantidade_contada',
    'local_contagem',
    'diferenca',
  ];
  const sep = ';';
  const mobileLabel = inv.contagemMobileHabilitada ? 'Sim' : 'Nao';
  const linhas = [
    header.join(sep),
    ...inv.itens.map((row) => {
      const diferenca = row.quantidadeContada - row.saldoSistema;
      const cells = [
        inv.codigo,
        inv.descricao,
        inv.responsavel,
        inv.dataInventario,
        inv.status,
        mobileLabel,
        inv.observacoes,
        row.codigoMaterial,
        row.descricaoMaterial,
        row.unidade,
        formatDecimalExcelPtBr(Number(row.saldoSistema)),
        formatDecimalExcelPtBr(Number(row.quantidadeContada)),
        String(row.localizacaoContada ?? ''),
        formatDecimalExcelPtBr(diferenca),
      ];
      return cells.map((c) => escapeCsvCellSemicolon(String(c))).join(sep);
    }),
  ];
  const csv = `\uFEFF${linhas.join('\r\n')}\r\n`;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `iso-pro-inventario-${sanitizeInventarioExportFileSegment(inv.codigo)}-${stamp}.csv`;
  return { success: true, data: { csv, fileName } };
}
