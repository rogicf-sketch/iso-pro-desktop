import { escapeCsvCellSemicolon, parseCsvToRecords } from '../../../lib/csv';
import { hasSupabaseConfig } from '../../../lib/supabase';
import {
  commitIsoProSnapshotWrite,
  readIsoProSnapshotPayload,
  readIsoProSnapshotPayloadForWrite,
} from '../../../lib/isoProSnapshot';
import { executeWrite, withLocalFallback } from '../../../lib/service-result';
import type { PaginatedResult, ServiceResult } from '../../../types/common.types';
import { validateFornecedor } from '../schemas/fornecedor.schema';
import type { Fornecedor, FornecedorFiltro, FornecedorFormData } from '../types/fornecedor.types';
import {
  fornecedorRowToFormData,
  type ResultadoImportacaoFornecedoresCsv,
} from './fornecedores.import.csv';

const STORAGE_KEY = 'iso-pro-desktop-fornecedores';

const seedData: Fornecedor[] = [
  {
    id: 'for-1',
    nome: 'Fornecedor A - Tubos Ltda',
    cnpj: '12.345.678/0001-90',
    telefone: '(11) 3456-7890',
    email: 'contato@tubos.com',
    endereco: 'Av. Paulista, 1000',
    ativo: true,
  },
  {
    id: 'for-2',
    nome: 'Fornecedor B - Conexoes S/A',
    cnpj: '23.456.789/0001-01',
    telefone: '(11) 4567-8901',
    email: 'vendas@conexoes.com',
    endereco: 'Rua Augusta, 500',
    ativo: true,
  },
];

function readAll(): Fornecedor[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seedData));
    return seedData;
  }

  try {
    return JSON.parse(raw) as Fornecedor[];
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seedData));
    return seedData;
  }
}

function writeAll(items: Fornecedor[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

async function loadFornecedores() {
  return hasSupabaseConfig() ? await readSnapshotFornecedores().catch(() => readAll()) : readAll();
}

function normalizeLookupValue(value: string) {
  return value.trim().toLowerCase();
}

/** Mesma regra da listagem (busca, status), sem paginacao. */
export function aplicarFiltrosListaFornecedores(
  items: Fornecedor[],
  filtro: Pick<FornecedorFiltro, 'busca' | 'status'>,
): Fornecedor[] {
  let result = items;
  if (filtro.busca.trim()) {
    const busca = filtro.busca.trim().toLowerCase();
    result = result.filter((item) => `${item.nome} ${item.cnpj} ${item.email} ${item.telefone}`.toLowerCase().includes(busca));
  }
  if (filtro.status === 'ativos') result = result.filter((item) => item.ativo);
  if (filtro.status === 'inativos') result = result.filter((item) => !item.ativo);
  return [...result].sort((a, b) => a.nome.localeCompare(b.nome));
}

function exportacaoFornecedoresUsaFiltroRestrito(filtro?: FornecedorFiltro): boolean {
  if (!filtro) return false;
  return filtro.busca.trim() !== '' || filtro.status !== 'todos';
}

type SnapshotPayload = {
  fornecedores?: Array<{
    id?: string | number;
    nome?: string;
    cnpj?: string;
    telefone?: string;
    email?: string;
    endereco?: string;
    ativo?: boolean;
  }>;
};

async function readSnapshotFornecedores(): Promise<Fornecedor[]> {
  const payload = await readIsoProSnapshotPayload<SnapshotPayload>();
  return (payload.fornecedores ?? []).map((item, index) => ({
    id: String(item.id ?? `for-${index + 1}`),
    nome: String(item.nome ?? ''),
    cnpj: String(item.cnpj ?? ''),
    telefone: String(item.telefone ?? ''),
    email: String(item.email ?? ''),
    endereco: String(item.endereco ?? ''),
    ativo: item.ativo ?? true,
  }));
}

async function writeSnapshotFornecedores(items: Fornecedor[]): Promise<void> {
  await commitIsoProSnapshotWrite(async () => {
    const { payload: currentPayload, baselineUpdatedAt } = await readIsoProSnapshotPayloadForWrite<SnapshotPayload>();
    return {
      baselineUpdatedAt,
      nextPayload: {
        ...currentPayload,
        fornecedores: items.map((item) => ({
          id: item.id,
          nome: item.nome,
          cnpj: item.cnpj,
          telefone: item.telefone,
          email: item.email,
          endereco: item.endereco,
          ativo: item.ativo,
        })),
        dataAtualizacao: new Date().toISOString(),
      },
    };
  });
}

export async function listarFornecedores(filtro: FornecedorFiltro): Promise<ServiceResult<PaginatedResult<Fornecedor>>> {
  const fallbackResult = await withLocalFallback({
    shouldTryRemote: hasSupabaseConfig(),
    loadRemote: () => readSnapshotFornecedores(),
    loadLocal: () => readAll(),
    fallbackMessage: 'Falha ao consultar fornecedores no Supabase.',
  });
  const items = aplicarFiltrosListaFornecedores(fallbackResult.data, filtro);

  const start = (filtro.page - 1) * filtro.pageSize;
  const end = start + filtro.pageSize;

  return {
    success: true,
    data: {
      items: items.slice(start, end),
      total: items.length,
      page: filtro.page,
      pageSize: filtro.pageSize,
    },
    meta: fallbackResult.meta,
  };
}

export async function salvarFornecedor(payload: FornecedorFormData, currentId?: string): Promise<ServiceResult<Fornecedor>> {
  const items = await loadFornecedores();
  const normalizedNome = normalizeLookupValue(payload.nome);
  const duplicated = items.find((item) => normalizeLookupValue(item.nome) === normalizedNome && item.id !== currentId);
  if (duplicated) return { success: false, error: 'Ja existe um fornecedor com esse nome.' };

  if (currentId) {
    const index = items.findIndex((item) => item.id === currentId);
    if (index === -1) return { success: false, error: 'Fornecedor nao encontrado.' };
    items[index] = {
      ...items[index],
      ...payload,
      nome: payload.nome.trim(),
      cnpj: payload.cnpj.trim(),
      telefone: payload.telefone.trim(),
      email: payload.email.trim(),
      endereco: payload.endereco.trim(),
    };
    return executeWrite({
      shouldWriteRemote: hasSupabaseConfig(),
      writeRemote: () => writeSnapshotFornecedores(items),
      writeLocal: () => writeAll(items),
      successData: items[index],
      fallbackMessage: 'Falha ao salvar fornecedor no Supabase.',
    });
  }

  const created: Fornecedor = {
    id: crypto.randomUUID(),
    ...payload,
    nome: payload.nome.trim(),
    cnpj: payload.cnpj.trim(),
    telefone: payload.telefone.trim(),
    email: payload.email.trim(),
    endereco: payload.endereco.trim(),
  };
  items.push(created);
  return executeWrite({
    shouldWriteRemote: hasSupabaseConfig(),
    writeRemote: () => writeSnapshotFornecedores(items),
    writeLocal: () => writeAll(items),
    successData: created,
    fallbackMessage: 'Falha ao salvar fornecedor no Supabase.',
  });
}

export async function buscarFornecedorPorId(id: string): Promise<ServiceResult<Fornecedor>> {
  const item = (await loadFornecedores()).find((fornecedor) => fornecedor.id === id);
  if (!item) return { success: false, error: 'Fornecedor nao encontrado.' };
  return { success: true, data: item };
}

export async function toggleFornecedorStatus(id: string, ativo: boolean): Promise<ServiceResult<Fornecedor>> {
  const items = await loadFornecedores();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return { success: false, error: 'Fornecedor nao encontrado.' };
  items[index] = { ...items[index], ativo };
  return executeWrite({
    shouldWriteRemote: hasSupabaseConfig(),
    writeRemote: () => writeSnapshotFornecedores(items),
    writeLocal: () => writeAll(items),
    successData: items[index],
    fallbackMessage: 'Falha ao atualizar fornecedor no Supabase.',
  });
}

export type ExportacaoFornecedoresOpcoes = {
  filtroLista?: FornecedorFiltro;
};

export async function montarExportacaoFornecedoresCsv(
  opcoes?: ExportacaoFornecedoresOpcoes,
): Promise<ServiceResult<{ csv: string; fileName: string }>> {
  const fallbackResult = await withLocalFallback({
    shouldTryRemote: hasSupabaseConfig(),
    loadRemote: () => readSnapshotFornecedores(),
    loadLocal: () => readAll(),
    fallbackMessage: 'Falha ao consultar fornecedores no Supabase.',
  });
  const filtroLista =
    opcoes?.filtroLista ??
    ({
      busca: '',
      status: 'todos',
      page: 1,
      pageSize: 999999,
    } as FornecedorFiltro);
  const items = aplicarFiltrosListaFornecedores(fallbackResult.data, filtroLista);

  const header = ['nome', 'cnpj', 'telefone', 'email', 'endereco', 'ativo'];
  const sep = ';';
  const linhas = [
    header.join(sep),
    ...items.map((m) =>
      [m.nome, m.cnpj, m.telefone, m.email, m.endereco, m.ativo ? 'sim' : 'nao']
        .map((c) => escapeCsvCellSemicolon(String(c)))
        .join(sep),
    ),
  ];
  const csv = `\uFEFF${linhas.join('\r\n')}\r\n`;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const sufixo = exportacaoFornecedoresUsaFiltroRestrito(opcoes?.filtroLista) ? '-filtrado' : '';
  const fileName = `iso-pro-fornecedores-${stamp}${sufixo}.csv`;
  return { success: true, data: { csv, fileName }, meta: fallbackResult.meta };
}

export async function importarFornecedoresDoArquivoCsv(
  text: string,
): Promise<ServiceResult<ResultadoImportacaoFornecedoresCsv>> {
  const parsed = parseCsvToRecords(text);
  if (!parsed || parsed.rows.length === 0) {
    return { success: false, error: 'CSV invalido ou sem linhas de dados (cabecalho obrigatorio).' };
  }

  const cache = await loadFornecedores();

  let criados = 0;
  let atualizados = 0;
  let ignorados = 0;
  let ignoradosPorDuplicidadeNoArquivo = 0;
  const detalhes: string[] = [];

  const seenNomeNoArquivo = new Set<string>();

  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i];
    const lineNum = i + 2;
    const form = fornecedorRowToFormData(row);

    if (!form.nome.trim()) {
      ignorados += 1;
      detalhes.push(`Linha ${lineNum}: nome vazio.`);
      continue;
    }

    const nk = normalizeLookupValue(form.nome);
    if (seenNomeNoArquivo.has(nk)) {
      ignorados += 1;
      ignoradosPorDuplicidadeNoArquivo += 1;
      detalhes.push(`Linha ${lineNum}: nome repetido no arquivo (${form.nome}).`);
      continue;
    }
    seenNomeNoArquivo.add(nk);

    const validationError = validateFornecedor(form);
    if (validationError) {
      ignorados += 1;
      detalhes.push(`Linha ${lineNum}: ${validationError}`);
      continue;
    }

    const existing = cache.find((c) => normalizeLookupValue(c.nome) === nk);
    const result = await salvarFornecedor(form, existing?.id);

    if (!result.success || !result.data) {
      ignorados += 1;
      detalhes.push(`Linha ${lineNum}: ${result.error ?? 'Falha ao salvar.'}`);
      continue;
    }

    if (existing) {
      const idx = cache.findIndex((c) => c.id === existing.id);
      if (idx !== -1) cache[idx] = result.data;
      atualizados += 1;
    } else {
      cache.push(result.data);
      criados += 1;
    }
  }

  return {
    success: true,
    data: {
      criados,
      atualizados,
      ignorados,
      ignoradosPorDuplicidadeNoArquivo,
      detalhes,
    },
  };
}
