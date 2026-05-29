import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';
import { avisarPreservacaoLocalStorageCorrupto } from '../../../lib/localStoragePreservacao';
import { hasSupabaseConfig } from '../../../lib/supabase';
import { escapeCsvCellSemicolon, parseCsvToRecords } from '../../../lib/csv';
import {
  commitIsoProSnapshotWrite,
  readIsoProSnapshotPayload,
  readIsoProSnapshotPayloadForWrite,
} from '../../../lib/isoProSnapshot';
import { registrarAtividadeBackupOracle } from '../../../lib/backupOracleAuto.client';
import { mensagemSeSubstituirLocalPerderiaCadastros } from '../../../lib/localSnapshotWriteGuard';
import { executeWrite, withLocalFallback } from '../../../lib/service-result';
import type { PaginatedResult, ServiceResult } from '../../../types/common.types';
import { validateColaborador } from '../schemas/colaborador.schema';
import { parseColaboradoresPersistidosRaw } from '../schemas/colaboradorPersistido.zod';
import type { Colaborador, ColaboradorFiltro, ColaboradorFormData } from '../types/colaborador.types';
import {
  colaboradorRowToFormData,
  type ResultadoImportacaoColaboradoresCsv,
} from './colaboradores.import.csv';

function colaboradoresStorageKey(): string {
  return getScopedIsoProStorageKey('iso-pro-desktop-colaboradores');
}

function bloqueioLocalColaboradores(tamanhoListaGravacao: number): string | null {
  return mensagemSeSubstituirLocalPerderiaCadastros([
    { storageKey: colaboradoresStorageKey(), tamanhoNovaLista: tamanhoListaGravacao, nomeCurto: 'colaborador(es)' },
  ]);
}

const seedData: Colaborador[] = [
  {
    id: 'col-1',
    nome: 'Joao Silva',
    tipo: 'interno',
    matricula: '12345',
    funcao: 'Conferente',
    empresa: 'ISO PRO',
    documento: '',
    telefone: '(11) 91234-5678',
    observacao: '',
    ativo: true,
  },
  {
    id: 'col-2',
    nome: 'Maria Santos',
    tipo: 'interno',
    matricula: '12346',
    funcao: 'Conferente',
    empresa: 'ISO PRO',
    documento: '',
    telefone: '(11) 92345-6789',
    observacao: '',
    ativo: true,
  },
];

function normalizeColaborador(item: Partial<Colaborador> & Pick<Colaborador, 'id' | 'nome'>): Colaborador {
  return {
    id: item.id,
    nome: String(item.nome ?? '').trim(),
    tipo: item.tipo === 'externo' ? 'externo' : 'interno',
    matricula: String(item.matricula ?? '').trim(),
    funcao: String(item.funcao ?? '').trim(),
    empresa: String(item.empresa ?? (item.tipo === 'externo' ? '' : 'ISO PRO')).trim(),
    documento: String(item.documento ?? '').trim(),
    telefone: String(item.telefone ?? '').trim(),
    observacao: String(item.observacao ?? '').trim(),
    ativo: item.ativo ?? true,
  };
}

function readAll(): Colaborador[] {
  const raw = localStorage.getItem(colaboradoresStorageKey());
  if (!raw) {
    localStorage.setItem(colaboradoresStorageKey(), JSON.stringify(seedData));
    return seedData;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const validated = parseColaboradoresPersistidosRaw(parsed);
    if (!validated) {
      avisarPreservacaoLocalStorageCorrupto('Colaboradores', colaboradoresStorageKey());
      return [];
    }
    return validated.map(normalizeColaborador);
  } catch {
    avisarPreservacaoLocalStorageCorrupto('Colaboradores', colaboradoresStorageKey());
    return [];
  }
}

function writeAll(items: Colaborador[]) {
  localStorage.setItem(colaboradoresStorageKey(), JSON.stringify(items));
}

async function loadColaboradores() {
  return hasSupabaseConfig() ? await readSnapshotColaboradores().catch(() => readAll()) : readAll();
}

function normalizeLookupValue(value: string) {
  return value.trim().toLowerCase();
}

/** Mesma regra da listagem (busca, tipo, status), sem paginacao. */
export function aplicarFiltrosListaColaboradores(
  items: Colaborador[],
  filtro: Pick<ColaboradorFiltro, 'busca' | 'tipo' | 'status'>,
): Colaborador[] {
  let result = items;
  if (filtro.busca.trim()) {
    const busca = filtro.busca.trim().toLowerCase();
    result = result.filter((item) =>
      `${item.nome} ${item.matricula} ${item.funcao} ${item.empresa} ${item.documento} ${item.telefone}`.toLowerCase().includes(busca),
    );
  }
  if (filtro.tipo !== 'todos') result = result.filter((item) => item.tipo === filtro.tipo);
  if (filtro.status === 'ativos') result = result.filter((item) => item.ativo);
  if (filtro.status === 'inativos') result = result.filter((item) => !item.ativo);
  return [...result].sort((a, b) => a.nome.localeCompare(b.nome));
}

function exportacaoColaboradoresUsaFiltroRestrito(filtro?: ColaboradorFiltro): boolean {
  if (!filtro) return false;
  return filtro.busca.trim() !== '' || filtro.tipo !== 'todos' || filtro.status !== 'todos';
}

type SnapshotPayload = {
  colaboradores?: Array<{
    id?: string | number;
    nome?: string;
    tipo?: 'interno' | 'externo';
    matricula?: string;
    funcao?: string;
    empresa?: string;
    documento?: string;
    telefone?: string;
    observacao?: string;
    ativo?: boolean;
  }>;
};

async function readSnapshotColaboradores(): Promise<Colaborador[]> {
  const payload = await readIsoProSnapshotPayload<SnapshotPayload>();
  return (payload.colaboradores ?? []).map((item, index) =>
    normalizeColaborador({
      id: String(item.id ?? `col-${index + 1}`),
      nome: String(item.nome ?? ''),
      tipo: item.tipo,
      matricula: String(item.matricula ?? ''),
      funcao: String(item.funcao ?? ''),
      empresa: String(item.empresa ?? ''),
      documento: String(item.documento ?? ''),
      telefone: String(item.telefone ?? ''),
      observacao: String(item.observacao ?? ''),
      ativo: item.ativo ?? true,
    }),
  );
}

async function writeSnapshotColaboradores(items: Colaborador[]): Promise<void> {
  await commitIsoProSnapshotWrite(async () => {
    const { payload: currentPayload, baselineUpdatedAt } = await readIsoProSnapshotPayloadForWrite<SnapshotPayload>();
    return {
      baselineUpdatedAt,
      nextPayload: {
        ...currentPayload,
        colaboradores: items.map((item) => ({
          id: item.id,
          nome: item.nome,
          tipo: item.tipo,
          matricula: item.matricula,
          funcao: item.funcao,
          empresa: item.empresa,
          documento: item.documento,
          telefone: item.telefone,
          observacao: item.observacao,
          ativo: item.ativo,
        })),
        dataAtualizacao: new Date().toISOString(),
      },
    };
  });
  registrarAtividadeBackupOracle('cadastro');
}

export async function listarColaboradores(filtro: ColaboradorFiltro): Promise<ServiceResult<PaginatedResult<Colaborador>>> {
  const fallbackResult = await withLocalFallback({
    shouldTryRemote: hasSupabaseConfig(),
    loadRemote: () => readSnapshotColaboradores(),
    loadLocal: () => readAll(),
    fallbackMessage: 'Falha ao consultar colaboradores no Supabase.',
  });
  const items = aplicarFiltrosListaColaboradores(fallbackResult.data, filtro);

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

/**
 * Nomes para assinaturas em RIR (responsavel recebimento / CQ): ativos,
 * exclui colaboradores com funcao exatamente "Cliente" (case-insensitive).
 */
export function colaboradoresElegiveisAssinaturaRir(items: Colaborador[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of items) {
    if (!c.ativo) continue;
    if (c.funcao.trim().toLowerCase() === 'cliente') continue;
    const n = c.nome.trim();
    if (!n) continue;
    const k = n.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  out.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return out;
}

export async function salvarColaborador(payload: ColaboradorFormData, currentId?: string): Promise<ServiceResult<Colaborador>> {
  const items = await loadColaboradores();
  const normalizedNome = normalizeLookupValue(payload.nome);
  const normalizedDocumento = normalizeLookupValue(payload.documento);
  const duplicated = items.find((item) => {
    const sameName = normalizeLookupValue(item.nome) === normalizedNome;
    const sameDocument =
      Boolean(normalizedDocumento) && normalizeLookupValue(item.documento) === normalizedDocumento;
    return item.id !== currentId && (sameDocument || sameName);
  });
  if (duplicated) return { success: false, error: 'Ja existe um colaborador com esse nome.' };

  if (currentId) {
    const index = items.findIndex((item) => item.id === currentId);
    if (index === -1) return { success: false, error: 'Colaborador nao encontrado.' };
    items[index] = {
      ...normalizeColaborador({
        ...items[index],
        ...payload,
        id: items[index].id,
        nome: payload.nome,
      }),
    };
    if (hasSupabaseConfig()) {
      const bloqueio = bloqueioLocalColaboradores(items.length);
      if (bloqueio) return { success: false, error: bloqueio };
    }
    return executeWrite({
      shouldWriteRemote: hasSupabaseConfig(),
      writeRemote: () => writeSnapshotColaboradores(items),
      writeLocal: () => writeAll(items),
      successData: items[index],
      fallbackMessage: 'Falha ao salvar colaborador no Supabase.',
    });
  }

  const created: Colaborador = {
    ...normalizeColaborador({
      id: crypto.randomUUID(),
      ...payload,
      nome: payload.nome,
    }),
  };
  items.push(created);
  if (hasSupabaseConfig()) {
    const bloqueio = bloqueioLocalColaboradores(items.length);
    if (bloqueio) return { success: false, error: bloqueio };
  }
  return executeWrite({
    shouldWriteRemote: hasSupabaseConfig(),
    writeRemote: () => writeSnapshotColaboradores(items),
    writeLocal: () => writeAll(items),
    successData: created,
    fallbackMessage: 'Falha ao salvar colaborador no Supabase.',
  });
}

export async function buscarColaboradorPorId(id: string): Promise<ServiceResult<Colaborador>> {
  const item = (await loadColaboradores()).find((colaborador) => colaborador.id === id);
  if (!item) return { success: false, error: 'Colaborador nao encontrado.' };
  return { success: true, data: item };
}

export async function listarColaboradoresAtivos(): Promise<Colaborador[]> {
  const items = await loadColaboradores();
  return [...items].filter((item) => item.ativo).sort((a, b) => a.nome.localeCompare(b.nome));
}

export async function registrarRetiranteExterno(payload: {
  nome: string;
  empresa: string;
  documento: string;
  telefone: string;
  observacao?: string;
}): Promise<ServiceResult<Colaborador>> {
  const items = await loadColaboradores();
  const documento = normalizeLookupValue(payload.documento);
  const nome = normalizeLookupValue(payload.nome);

  const existingIndex = items.findIndex(
    (item) => item.ativo && item.tipo === 'externo' && ((documento && item.documento.trim().toLowerCase() === documento) || item.nome.trim().toLowerCase() === nome),
  );

  if (existingIndex !== -1) {
    const existing = items[existingIndex];
    const updated = normalizeColaborador({
      ...existing,
      nome: payload.nome,
      empresa: payload.empresa,
      documento: payload.documento,
      telefone: payload.telefone,
      observacao: payload.observacao ?? existing.observacao,
      ativo: true,
    });
    items[existingIndex] = updated;
    if (hasSupabaseConfig()) {
      const bloqueio = bloqueioLocalColaboradores(items.length);
      if (bloqueio) return { success: false, error: bloqueio };
    }
    return executeWrite({
      shouldWriteRemote: hasSupabaseConfig(),
      writeRemote: () => writeSnapshotColaboradores(items),
      writeLocal: () => writeAll(items),
      successData: updated,
      fallbackMessage: 'Falha ao registrar retirante externo no Supabase.',
    });
  }

  const created = normalizeColaborador({
    id: crypto.randomUUID(),
    nome: payload.nome,
    tipo: 'externo',
    matricula: '',
    funcao: 'Retirante externo',
    empresa: payload.empresa,
    documento: payload.documento,
    telefone: payload.telefone,
    observacao: payload.observacao ?? '',
    ativo: true,
  });
  items.push(created);
  if (hasSupabaseConfig()) {
    const bloqueio = bloqueioLocalColaboradores(items.length);
    if (bloqueio) return { success: false, error: bloqueio };
  }
  return executeWrite({
    shouldWriteRemote: hasSupabaseConfig(),
    writeRemote: () => writeSnapshotColaboradores(items),
    writeLocal: () => writeAll(items),
    successData: created,
    fallbackMessage: 'Falha ao registrar retirante externo no Supabase.',
  });
}

export async function toggleColaboradorStatus(id: string, ativo: boolean): Promise<ServiceResult<Colaborador>> {
  const items = await loadColaboradores();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return { success: false, error: 'Colaborador nao encontrado.' };
  items[index] = { ...items[index], ativo };
  if (hasSupabaseConfig()) {
    const bloqueio = bloqueioLocalColaboradores(items.length);
    if (bloqueio) return { success: false, error: bloqueio };
  }
  return executeWrite({
    shouldWriteRemote: hasSupabaseConfig(),
    writeRemote: () => writeSnapshotColaboradores(items),
    writeLocal: () => writeAll(items),
    successData: items[index],
    fallbackMessage: 'Falha ao atualizar colaborador no Supabase.',
  });
}

export type ExportacaoColaboradoresOpcoes = {
  filtroLista?: ColaboradorFiltro;
};

export async function montarExportacaoColaboradoresCsv(
  opcoes?: ExportacaoColaboradoresOpcoes,
): Promise<ServiceResult<{ csv: string; fileName: string }>> {
  const fallbackResult = await withLocalFallback({
    shouldTryRemote: hasSupabaseConfig(),
    loadRemote: () => readSnapshotColaboradores(),
    loadLocal: () => readAll(),
    fallbackMessage: 'Falha ao consultar colaboradores no Supabase.',
  });
  const filtroLista =
    opcoes?.filtroLista ??
    ({
      busca: '',
      tipo: 'todos',
      status: 'todos',
      page: 1,
      pageSize: 999999,
    } as ColaboradorFiltro);
  const items = aplicarFiltrosListaColaboradores(fallbackResult.data, filtroLista);

  const header = [
    'nome',
    'tipo',
    'matricula',
    'funcao',
    'empresa',
    'documento',
    'telefone',
    'observacao',
    'ativo',
  ];
  const sep = ';';
  const linhas = [
    header.join(sep),
    ...items.map((m) =>
      [
        m.nome,
        m.tipo,
        m.matricula,
        m.funcao,
        m.empresa,
        m.documento,
        m.telefone,
        m.observacao,
        m.ativo ? 'sim' : 'nao',
      ]
        .map((c) => escapeCsvCellSemicolon(String(c)))
        .join(sep),
    ),
  ];
  const csv = `\uFEFF${linhas.join('\r\n')}\r\n`;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const sufixo = exportacaoColaboradoresUsaFiltroRestrito(opcoes?.filtroLista) ? '-filtrado' : '';
  const fileName = `iso-pro-colaboradores-${stamp}${sufixo}.csv`;
  return { success: true, data: { csv, fileName }, meta: fallbackResult.meta };
}

export async function importarColaboradoresDoArquivoCsv(
  text: string,
): Promise<ServiceResult<ResultadoImportacaoColaboradoresCsv>> {
  const parsed = parseCsvToRecords(text);
  if (!parsed || parsed.rows.length === 0) {
    return { success: false, error: 'CSV invalido ou sem linhas de dados (cabecalho obrigatorio).' };
  }

  /** Copia mutavel: aplicamos todas as linhas em memoria e gravamos o snapshot **uma vez** (evita centenas de round-trips ao Supabase). */
  const items: Colaborador[] = [...(await loadColaboradores())];

  let criados = 0;
  let atualizados = 0;
  let ignorados = 0;
  let ignoradosPorDuplicidadeNoArquivo = 0;
  const detalhes: string[] = [];

  const seenNomeNoArquivo = new Set<string>();

  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i];
    const lineNum = i + 2;
    const form = colaboradorRowToFormData(row);

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

    const validationError = validateColaborador(form);
    if (validationError) {
      ignorados += 1;
      detalhes.push(`Linha ${lineNum}: ${validationError}`);
      continue;
    }

    const normalizedNome = normalizeLookupValue(form.nome);
    const normalizedDocumento = normalizeLookupValue(form.documento);
    const existing = items.find((c) => normalizeLookupValue(c.nome) === nk);

    const duplicated = items.find((item) => {
      const sameName = normalizeLookupValue(item.nome) === normalizedNome;
      const sameDocument =
        Boolean(normalizedDocumento) && normalizeLookupValue(item.documento) === normalizedDocumento;
      return item.id !== existing?.id && (sameName || sameDocument);
    });
    if (duplicated) {
      ignorados += 1;
      detalhes.push(`Linha ${lineNum}: Ja existe um colaborador com esse nome ou documento.`);
      continue;
    }

    if (existing) {
      const index = items.findIndex((item) => item.id === existing.id);
      if (index === -1) {
        ignorados += 1;
        detalhes.push(`Linha ${lineNum}: colaborador nao encontrado para atualizacao.`);
        continue;
      }
      items[index] = normalizeColaborador({
        ...items[index],
        ...form,
        id: items[index].id,
        nome: form.nome,
      });
      atualizados += 1;
    } else {
      items.push(
        normalizeColaborador({
          id: crypto.randomUUID(),
          ...form,
          nome: form.nome,
        }),
      );
      criados += 1;
    }
  }

  if (hasSupabaseConfig()) {
    const bloqueio = bloqueioLocalColaboradores(items.length);
    if (bloqueio) {
      return { success: false, error: bloqueio };
    }
  }

  const writeResult = await executeWrite({
    shouldWriteRemote: hasSupabaseConfig(),
    writeRemote: () => writeSnapshotColaboradores(items),
    writeLocal: () => writeAll(items),
    successData: items[0] ?? readAll()[0],
    fallbackMessage: 'Falha ao gravar colaboradores importados no Supabase.',
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
