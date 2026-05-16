import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';
import { escapeCsvCellSemicolon, formatDecimalExcelPtBr } from '../../../lib/csv';
import { hasSupabaseConfig } from '../../../lib/supabase';
import {
  commitIsoProSnapshotWrite,
  readIsoProSnapshotPayload,
  readIsoProSnapshotPayloadForWrite,
} from '../../../lib/isoProSnapshot';
import { mensagemSeSubstituirLocalPerderiaCadastros } from '../../../lib/localSnapshotWriteGuard';
import { executeWrite, withLocalFallback } from '../../../lib/service-result';
import type { PaginatedResult, ServiceResult } from '../../../types/common.types';
import type { Inventario, InventarioFiltro, InventarioFormData, InventarioListItem } from '../types/inventario.types';
import { avisarPreservacaoLocalStorageCorrupto } from '../../../lib/localStoragePreservacao';
import { parseInventariosPersistidos } from '../schemas/inventarioPersistido.zod';

function inventariosStorageKey(): string {
  return getScopedIsoProStorageKey('iso-pro-desktop-inventarios');
}

function bloqueioLocalInventarios(tamanhoListaGravacao: number): string | null {
  return mensagemSeSubstituirLocalPerderiaCadastros([
    { storageKey: inventariosStorageKey(), tamanhoNovaLista: tamanhoListaGravacao, nomeCurto: 'inventario(s)' },
  ]);
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
      },
      {
        id: 'inv-1-item-2',
        codigoMaterial: 'EL-0102',
        descricaoMaterial: 'Cabo eletrico 10mm',
        unidade: 'M',
        saldoSistema: 200,
        quantidadeContada: 205,
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
      },
    ],
  },
];

function readAll(): Inventario[] {
  const raw = localStorage.getItem(inventariosStorageKey());
  if (!raw) {
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
 * Se o snapshot remoto ainda nao tiver inventarios, mostra os exemplos de fabrica (mesma seed que o modo local).
 */
async function loadInventarios(): Promise<Inventario[]> {
  if (!hasSupabaseConfig()) return readAll();
  try {
    const remote = await readSnapshotInventarios();
    if (remote.length === 0) return seedData;
    return remote;
  } catch {
    return readAll();
  }
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
    }>;
  }>;
};

async function readSnapshotInventarios(): Promise<Inventario[]> {
  const payload = await readIsoProSnapshotPayload<SnapshotPayload>();
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
    })),
  }));
}

async function writeSnapshotInventarios(items: Inventario[]): Promise<void> {
  await commitIsoProSnapshotWrite(async () => {
    const { payload: currentPayload, baselineUpdatedAt } = await readIsoProSnapshotPayloadForWrite<SnapshotPayload>();
    return {
      baselineUpdatedAt,
      nextPayload: {
        ...currentPayload,
        inventarios: items.map((item) => ({
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
          })),
        })),
        dataAtualizacao: new Date().toISOString(),
      },
    };
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
  if (!data.itens.length) return 'Adicione pelo menos um item ao inventario.';
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
  const fallbackResult = await withLocalFallback({
    shouldTryRemote: hasSupabaseConfig(),
    loadRemote: async () => {
      const remote = await readSnapshotInventarios();
      return remote.length === 0 ? seedData : remote;
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
      const items = await readSnapshotInventarios();
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
        items[index] = { ...items[index], ...normalized };
        const bloqueioEdit = bloqueioLocalInventarios(items.length);
        if (bloqueioEdit) return { success: false, error: bloqueioEdit };
        return executeWrite({
          shouldWriteRemote: true,
          writeRemote: () => writeSnapshotInventarios(items),
          writeLocal: () => writeAll(items),
          successData: items[index],
          fallbackMessage: 'Falha ao salvar inventario no Supabase.',
        });
      }

      const created: Inventario = {
        id: crypto.randomUUID(),
        status: 'aberto',
        ...normalized,
      };
      items.push(created);
      const bloqueioNovo = bloqueioLocalInventarios(items.length);
      if (bloqueioNovo) return { success: false, error: bloqueioNovo };
      return executeWrite({
        shouldWriteRemote: true,
        writeRemote: () => writeSnapshotInventarios(items),
        writeLocal: () => writeAll(items),
        successData: created,
        fallbackMessage: 'Falha ao salvar inventario no Supabase.',
      });
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
    items[index] = { ...items[index], ...normalized };
    writeAll(items);
    return { success: true, data: items[index] };
  }

  const created: Inventario = {
    id: crypto.randomUUID(),
    status: 'aberto',
    ...normalized,
  };

  items.push(created);
  writeAll(items);
  return { success: true, data: created };
}

export async function fecharInventario(id: string): Promise<ServiceResult<Inventario>> {
  if (hasSupabaseConfig()) {
    try {
      const items = await readSnapshotInventarios();
      const index = items.findIndex((item) => item.id === id);
      if (index === -1) return { success: false, error: 'Inventario nao encontrado.' };
      if (items[index].status === 'fechado') return { success: false, error: 'Inventario ja fechado.' };
      if (items[index].status === 'cancelado') return { success: false, error: 'Inventario cancelado nao pode ser fechado.' };
      const closingError = validateInventarioForClosing(items[index]);
      if (closingError) return { success: false, error: closingError };
      items[index] = { ...items[index], status: 'fechado' };
      const bloqueioFechar = bloqueioLocalInventarios(items.length);
      if (bloqueioFechar) return { success: false, error: bloqueioFechar };
      return executeWrite({
        shouldWriteRemote: true,
        writeRemote: () => writeSnapshotInventarios(items),
        writeLocal: () => writeAll(items),
        successData: items[index],
        fallbackMessage: 'Falha ao fechar inventario no Supabase.',
      });
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
  items[index] = { ...items[index], status: 'fechado' };
  writeAll(items);
  return { success: true, data: items[index] };
}

export async function buscarInventarioPorId(id: string): Promise<ServiceResult<Inventario>> {
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
