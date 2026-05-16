import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';
import { avisarPreservacaoLocalStorageCorrupto } from '../../../lib/localStoragePreservacao';
import { escapeCsvCellSemicolon, parseCsvToRecords } from '../../../lib/csv';
import { mensagemSeCabecalhoImportCsvIncompativel } from '../../../lib/csvImportHeaderGuard';
import { hasSupabaseConfig } from '../../../lib/supabase';
import {
  commitIsoProSnapshotWrite,
  readIsoProSnapshotPayload,
  readIsoProSnapshotPayloadForWrite,
} from '../../../lib/isoProSnapshot';
import { mensagemSeSubstituirLocalPerderiaCadastros } from '../../../lib/localSnapshotWriteGuard';
import { executeWrite, withLocalFallback } from '../../../lib/service-result';
import type { PaginatedResult, ServiceResult } from '../../../types/common.types';
import { validateFornecedor } from '../schemas/fornecedor.schema';
import { parseFornecedoresPersistidos } from '../schemas/fornecedorPersistido.zod';
import type { Fornecedor, FornecedorFiltro, FornecedorFormData } from '../types/fornecedor.types';
import {
  fornecedorRowToFormData,
  type ResultadoImportacaoFornecedoresCsv,
} from './fornecedores.import.csv';

function fornecedoresStorageKey(): string {
  return getScopedIsoProStorageKey('iso-pro-desktop-fornecedores');
}

function bloqueioLocalFornecedores(tamanhoListaGravacao: number): string | null {
  return mensagemSeSubstituirLocalPerderiaCadastros([
    { storageKey: fornecedoresStorageKey(), tamanhoNovaLista: tamanhoListaGravacao, nomeCurto: 'fornecedor(es)' },
  ]);
}

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
  const raw = localStorage.getItem(fornecedoresStorageKey());
  if (!raw) {
    localStorage.setItem(fornecedoresStorageKey(), JSON.stringify(seedData));
    return seedData;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const validated = parseFornecedoresPersistidos(parsed);
    if (!validated) {
      avisarPreservacaoLocalStorageCorrupto('Fornecedores', fornecedoresStorageKey());
      return [];
    }
    return validated;
  } catch {
    avisarPreservacaoLocalStorageCorrupto('Fornecedores', fornecedoresStorageKey());
    return [];
  }
}

function writeAll(items: Fornecedor[]) {
  localStorage.setItem(fornecedoresStorageKey(), JSON.stringify(items));
}

async function loadFornecedores() {
  return hasSupabaseConfig() ? await readSnapshotFornecedores().catch(() => readAll()) : readAll();
}

/**
 * Mesma regra da listagem em Fornecedores: snapshot na nuvem com fallback local.
 * Apenas ativos — para validar recebimentos e importacoes.
 */
export async function loadFornecedoresAtivosParaValidacaoRecebimento(): Promise<Fornecedor[]> {
  const { data } = await withLocalFallback({
    shouldTryRemote: hasSupabaseConfig(),
    loadRemote: () => readSnapshotFornecedores(),
    loadLocal: () => readAll(),
    fallbackMessage: 'Falha ao consultar fornecedores.',
  });
  return data.filter((f) => f.ativo);
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
    if (hasSupabaseConfig()) {
      const bloqueio = bloqueioLocalFornecedores(items.length);
      if (bloqueio) return { success: false, error: bloqueio };
    }
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
  if (hasSupabaseConfig()) {
    const bloqueio = bloqueioLocalFornecedores(items.length);
    if (bloqueio) return { success: false, error: bloqueio };
  }
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

/**
 * Nome exatamente como gravado no cadastro (apenas fornecedores ativos), ou null.
 * Comparacao sem distincao de maiusculas/acentos (pt-BR).
 */
export async function resolverNomeFornecedorCadastradoAtivo(nomeDigitado: string): Promise<string | null> {
  const raw = nomeDigitado.trim();
  if (!raw) return null;
  const items = await loadFornecedoresAtivosParaValidacaoRecebimento();
  for (const f of items) {
    if (raw.localeCompare(f.nome.trim(), 'pt-BR', { sensitivity: 'base' }) === 0) {
      return f.nome.trim();
    }
  }
  return null;
}

/**
 * Valida uma lista de nomes (ex.: cabecalhos de importacao). Retorna mensagem de erro ou null se todos existirem ativos.
 */
export async function validarNomesFornecedoresCadastradosAtivos(nomes: string[]): Promise<string | null> {
  const unique = [...new Set(nomes.map((n) => n.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  );
  const invalid: string[] = [];
  for (const nome of unique) {
    const resolved = await resolverNomeFornecedorCadastradoAtivo(nome);
    if (!resolved) invalid.push(nome);
  }
  if (invalid.length === 0) return null;
  const quoted = invalid.map((s) => `"${s}"`).join(', ');
  return `Importacao nao concluida. Fornecedor nao cadastrado no sistema: ${quoted}. Cadastre em Fornecedores e tente novamente.`;
}

export async function toggleFornecedorStatus(id: string, ativo: boolean): Promise<ServiceResult<Fornecedor>> {
  const items = await loadFornecedores();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return { success: false, error: 'Fornecedor nao encontrado.' };
  items[index] = { ...items[index], ativo };
  if (hasSupabaseConfig()) {
    const bloqueio = bloqueioLocalFornecedores(items.length);
    if (bloqueio) return { success: false, error: bloqueio };
  }
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
  const cabErr = mensagemSeCabecalhoImportCsvIncompativel('fornecedores', text);
  if (cabErr) {
    return { success: false, error: cabErr };
  }
  const parsed = parseCsvToRecords(text);
  if (!parsed || parsed.rows.length === 0) {
    return { success: false, error: 'CSV invalido ou sem linhas de dados (cabecalho obrigatorio).' };
  }

  const items: Fornecedor[] = [...(await loadFornecedores())];

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

    const existing = items.find((c) => normalizeLookupValue(c.nome) === nk);
    const duplicated = items.find((item) => normalizeLookupValue(item.nome) === nk && item.id !== existing?.id);
    if (duplicated) {
      ignorados += 1;
      detalhes.push(`Linha ${lineNum}: Ja existe um fornecedor com esse nome.`);
      continue;
    }

    if (existing) {
      const index = items.findIndex((item) => item.id === existing.id);
      if (index === -1) {
        ignorados += 1;
        detalhes.push(`Linha ${lineNum}: fornecedor nao encontrado para atualizacao.`);
        continue;
      }
      items[index] = {
        ...items[index],
        ...form,
        nome: form.nome.trim(),
        cnpj: form.cnpj.trim(),
        telefone: form.telefone.trim(),
        email: form.email.trim(),
        endereco: form.endereco.trim(),
      };
      atualizados += 1;
    } else {
      items.push({
        id: crypto.randomUUID(),
        ...form,
        nome: form.nome.trim(),
        cnpj: form.cnpj.trim(),
        telefone: form.telefone.trim(),
        email: form.email.trim(),
        endereco: form.endereco.trim(),
      });
      criados += 1;
    }
  }

  if (hasSupabaseConfig()) {
    const bloqueio = bloqueioLocalFornecedores(items.length);
    if (bloqueio) {
      return { success: false, error: bloqueio };
    }
  }

  const writeResult = await executeWrite({
    shouldWriteRemote: hasSupabaseConfig(),
    writeRemote: () => writeSnapshotFornecedores(items),
    writeLocal: () => writeAll(items),
    successData: items[0] ?? readAll()[0],
    fallbackMessage: 'Falha ao gravar fornecedores importados no Supabase.',
  });

  if (!writeResult.success) {
    return {
      success: false,
      error: writeResult.error ?? 'Falha ao concluir importacao.',
      meta: writeResult.meta,
    };
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
