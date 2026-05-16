import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';
import { avisarPreservacaoLocalStorageCorrupto } from '../../../lib/localStoragePreservacao';
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
import { parseEquipamentosPersistidos } from '../schemas/equipamentoPersistido.zod';
import { validateEquipamento } from '../schemas/equipamento.schema';
import type {
  Equipamento,
  EquipamentoFiltro,
  EquipamentoFormData,
  EquipamentoIndicadores,
  EquipamentoStatusOperacao,
} from '../types/equipamento.types';
import { diasAteFimContrato, labelSituacaoContrato, situacaoContratoFromDias } from '../utils/equipamentoContrato';

function equipamentosStorageKey(): string {
  return getScopedIsoProStorageKey('iso-pro-desktop-equipamentos');
}

function bloqueioLocalEquipamentos(tamanhoListaGravacao: number): string | null {
  return mensagemSeSubstituirLocalPerderiaCadastros([
    { storageKey: equipamentosStorageKey(), tamanhoNovaLista: tamanhoListaGravacao, nomeCurto: 'equipamento(s)' },
  ]);
}

const seedData: Equipamento[] = [
  {
    id: 'eq-seed-1',
    codigo: 'PAT-001',
    tipoEquipamento: 'Escavadeira hidráulica',
    placa: 'ABC-1234',
    nomeOperador: 'João Silva',
    telefoneOperador: '(11) 99999-9999',
    setorResponsavel: 'Construção',
    empresaContratada: 'Construtora Alpha',
    dataInicioProjeto: '2026-01-15',
    dataFimContrato: '2027-01-15',
    valorContrato: 150000,
    numeroContrato: 'CONT-001',
    statusEquipamento: 'operando',
    observacoes: 'Locação obra norte.',
    dataCadastro: '2026-01-10T10:00:00.000Z',
  },
  {
    id: 'eq-seed-2',
    codigo: 'PAT-002',
    tipoEquipamento: 'Caminhão basculante',
    placa: 'XYZ-5678',
    nomeOperador: 'Carlos Santos',
    telefoneOperador: '(11) 88888-8888',
    setorResponsavel: 'Transporte',
    empresaContratada: 'Transportadora Beta',
    dataInicioProjeto: '2026-03-20',
    dataFimContrato: '2026-12-20',
    valorContrato: 80000,
    numeroContrato: 'CONT-002',
    statusEquipamento: 'operando',
    observacoes: '',
    dataCadastro: '2026-02-01T14:30:00.000Z',
  },
  {
    id: 'eq-seed-3',
    codigo: 'PAT-003',
    tipoEquipamento: 'Trator esteira',
    placa: 'DEF-9012',
    nomeOperador: 'Roberto Lima',
    telefoneOperador: '(11) 77777-7777',
    setorResponsavel: 'Terraplanagem',
    empresaContratada: 'Construtora Gamma',
    dataInicioProjeto: '2026-02-10',
    dataFimContrato: '2026-08-10',
    valorContrato: 120000,
    numeroContrato: 'CONT-003',
    statusEquipamento: 'manutencao',
    observacoes: 'Revisão programada.',
    dataCadastro: '2026-02-15T09:00:00.000Z',
  },
];

function migrateLegacyRow(o: Record<string, unknown>): Equipamento {
  const st = String(o.status ?? 'operacional');
  let statusEquipamento: EquipamentoStatusOperacao = 'operando';
  if (st === 'manutencao') statusEquipamento = 'manutencao';
  else if (st === 'inativo') statusEquipamento = 'parado';

  return {
    id: String(o.id ?? crypto.randomUUID()),
    codigo: String(o.codigo ?? ''),
    tipoEquipamento: String(o.tipo ?? o.nome ?? ''),
    placa: String(o.numeroSerie ?? '').trim() || '-',
    nomeOperador: '',
    telefoneOperador: '',
    setorResponsavel: String(o.localizacao ?? ''),
    empresaContratada: String(o.fabricante ?? ''),
    dataInicioProjeto: '',
    dataFimContrato: '',
    valorContrato: null,
    numeroContrato: '',
    statusEquipamento,
    observacoes: String(o.observacoes ?? ''),
    dataCadastro: String(o.dataCadastro ?? new Date().toISOString()),
  };
}

function parseLegacyEquipamentosArray(raw: unknown): Equipamento[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const first = raw[0];
  if (!first || typeof first !== 'object') return null;
  const f = first as Record<string, unknown>;
  if (typeof f.tipoEquipamento === 'string' || typeof f.placa === 'string') {
    return null;
  }
  if (!('nome' in f) && !('tipo' in f)) return null;
  return raw.map((row) => migrateLegacyRow(row as Record<string, unknown>));
}

function parseEquipamentosStorage(raw: unknown): Equipamento[] | null {
  const next = parseEquipamentosPersistidos(raw);
  if (next) return next;
  return parseLegacyEquipamentosArray(raw);
}

function readAll(): Equipamento[] {
  const raw = localStorage.getItem(equipamentosStorageKey());
  if (!raw) {
    localStorage.setItem(equipamentosStorageKey(), JSON.stringify(seedData));
    return seedData;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const validated = parseEquipamentosStorage(parsed);
    if (!validated) {
      avisarPreservacaoLocalStorageCorrupto('Equipamentos', equipamentosStorageKey());
      return [];
    }
    return validated;
  } catch {
    avisarPreservacaoLocalStorageCorrupto('Equipamentos', equipamentosStorageKey());
    return [];
  }
}

function writeAll(items: Equipamento[]) {
  localStorage.setItem(equipamentosStorageKey(), JSON.stringify(items));
}

export async function loadEquipamentos(): Promise<Equipamento[]> {
  return hasSupabaseConfig() ? await readSnapshotEquipamentos().catch(() => readAll()) : readAll();
}

function normalizeLookupValue(value: string) {
  return value.trim().toLowerCase();
}

function buildSearchText(item: Equipamento) {
  return `${item.codigo} ${item.tipoEquipamento} ${item.placa} ${item.nomeOperador} ${item.telefoneOperador} ${item.setorResponsavel} ${item.empresaContratada} ${item.numeroContrato}`.toLowerCase();
}

function mapSnapshotRow(row: Record<string, unknown>, index: number): Equipamento {
  if (typeof row.tipoEquipamento === 'string' || typeof row.placa === 'string') {
    const st = row.statusEquipamento;
    const statusOk =
      st === 'manutencao' || st === 'parado' || st === 'em_transito' || st === 'operando' ? st : 'operando';
    return {
      id: String(row.id ?? `eq-${index + 1}`),
      codigo: String(row.codigo ?? ''),
      tipoEquipamento: String(row.tipoEquipamento ?? ''),
      placa: String(row.placa ?? ''),
      nomeOperador: String(row.nomeOperador ?? ''),
      telefoneOperador: String(row.telefoneOperador ?? ''),
      setorResponsavel: String(row.setorResponsavel ?? ''),
      empresaContratada: String(row.empresaContratada ?? ''),
      dataInicioProjeto: String(row.dataInicioProjeto ?? ''),
      dataFimContrato: String(row.dataFimContrato ?? ''),
      valorContrato: row.valorContrato === null || row.valorContrato === undefined ? null : Number(row.valorContrato),
      numeroContrato: String(row.numeroContrato ?? ''),
      statusEquipamento: statusOk,
      observacoes: String(row.observacoes ?? ''),
      dataCadastro: String(row.dataCadastro ?? new Date().toISOString()),
    };
  }
  return migrateLegacyRow(row);
}

type SnapshotPayload = {
  equipamentos?: Array<Record<string, unknown>>;
};

async function readSnapshotEquipamentos(): Promise<Equipamento[]> {
  const payload = await readIsoProSnapshotPayload<SnapshotPayload>();
  return (payload.equipamentos ?? []).map((row, index) => mapSnapshotRow(row, index));
}

async function writeSnapshotEquipamentos(items: Equipamento[]): Promise<void> {
  await commitIsoProSnapshotWrite(async () => {
    const { payload: currentPayload, baselineUpdatedAt } = await readIsoProSnapshotPayloadForWrite<SnapshotPayload>();
    return {
      baselineUpdatedAt,
      nextPayload: {
        ...currentPayload,
        equipamentos: items.map((item) => ({ ...item })),
        dataAtualizacao: new Date().toISOString(),
      },
    };
  });
}

function filtrarPorSituacaoContrato(items: Equipamento[], filtro: EquipamentoFiltro['situacaoContrato']): Equipamento[] {
  if (filtro === 'todos') return items;
  return items.filter((item) => {
    const dias = diasAteFimContrato(item.dataFimContrato);
    const sit = situacaoContratoFromDias(dias);
    if (filtro === 'vencido') return sit === 'vencido';
    if (filtro === 'proximo_30') return sit === 'proximo';
    if (filtro === 'em_dia') return sit === 'em_dia';
    if (filtro === 'sem_prazo') return sit === 'sem_prazo';
    return true;
  });
}

/** Mesma regra de filtro da listagem (sem paginação), para exportação CSV. */
function aplicarFiltrosListaEquipamentos(items: Equipamento[], filtro: Pick<EquipamentoFiltro, 'busca' | 'statusOperacao' | 'situacaoContrato'>): Equipamento[] {
  let result = items;
  if (filtro.busca.trim()) {
    const busca = filtro.busca.trim().toLowerCase();
    result = result.filter((item) => buildSearchText(item).includes(busca));
  }
  if (filtro.statusOperacao !== 'todos') {
    result = result.filter((item) => item.statusEquipamento === filtro.statusOperacao);
  }
  result = filtrarPorSituacaoContrato(result, filtro.situacaoContrato);
  return [...result].sort((a, b) => b.dataCadastro.localeCompare(a.dataCadastro));
}

function filtrosEquipamentosEstaoPadrao(f: EquipamentoFiltro): boolean {
  return !f.busca.trim() && f.statusOperacao === 'todos' && f.situacaoContrato === 'todos';
}

export async function listarEquipamentos(filtro: EquipamentoFiltro): Promise<ServiceResult<PaginatedResult<Equipamento>>> {
  const fallbackResult = await withLocalFallback({
    shouldTryRemote: hasSupabaseConfig(),
    loadRemote: () => readSnapshotEquipamentos(),
    loadLocal: () => readAll(),
    fallbackMessage: 'Falha ao consultar equipamentos no Supabase.',
  });
  const items = aplicarFiltrosListaEquipamentos(fallbackResult.data, filtro);

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

export async function obterIndicadoresEquipamentos(): Promise<ServiceResult<EquipamentoIndicadores>> {
  const fallbackResult = await withLocalFallback({
    shouldTryRemote: hasSupabaseConfig(),
    loadRemote: () => readSnapshotEquipamentos(),
    loadLocal: () => readAll(),
    fallbackMessage: 'Falha ao consultar equipamentos no Supabase.',
  });
  const items = fallbackResult.data;
  let proximos = 0;
  let vencidos = 0;
  let emOp = 0;
  for (const item of items) {
    const dias = diasAteFimContrato(item.dataFimContrato);
    const sit = situacaoContratoFromDias(dias);
    if (sit === 'proximo') proximos += 1;
    if (sit === 'vencido') vencidos += 1;
    if (item.statusEquipamento === 'operando') emOp += 1;
  }
  return {
    success: true,
    data: {
      total: items.length,
      proximosVencer30: proximos,
      contratosVencidos: vencidos,
      emOperacao: emOp,
    },
    meta: fallbackResult.meta,
  };
}

export async function buscarEquipamentoPorId(id: string): Promise<ServiceResult<Equipamento>> {
  const item = (await loadEquipamentos()).find((e) => e.id === id);
  if (!item) return { success: false, error: 'Equipamento não encontrado.' };
  return { success: true, data: item };
}

function normalizeForm(payload: EquipamentoFormData): EquipamentoFormData {
  const valorRaw = payload.valorContrato;
  const valor =
    valorRaw === null || valorRaw === undefined || (typeof valorRaw === 'number' && Number.isNaN(valorRaw))
      ? null
      : valorRaw;

  return {
    ...payload,
    codigo: payload.codigo.trim(),
    tipoEquipamento: payload.tipoEquipamento.trim(),
    placa: payload.placa.trim(),
    nomeOperador: payload.nomeOperador.trim(),
    telefoneOperador: payload.telefoneOperador.trim(),
    setorResponsavel: payload.setorResponsavel.trim(),
    empresaContratada: payload.empresaContratada.trim(),
    dataInicioProjeto: payload.dataInicioProjeto.trim(),
    dataFimContrato: payload.dataFimContrato.trim(),
    numeroContrato: payload.numeroContrato.trim(),
    observacoes: payload.observacoes.trim(),
    valorContrato: valor,
  };
}

export async function salvarEquipamento(payload: EquipamentoFormData, currentId?: string): Promise<ServiceResult<Equipamento>> {
  const items = await loadEquipamentos();
  const normalized = normalizeForm(payload);
  const validationError = validateEquipamento(normalized);
  if (validationError) return { success: false, error: validationError };

  const codigoNorm = normalizeLookupValue(normalized.codigo);
  const placaNorm = normalizeLookupValue(normalized.placa);
  const dupCodigo =
    Boolean(codigoNorm) && items.some((item) => item.id !== currentId && normalizeLookupValue(item.codigo) === codigoNorm);
  const dupPlaca =
    Boolean(placaNorm) && items.some((item) => item.id !== currentId && normalizeLookupValue(item.placa) === placaNorm);
  if (dupCodigo) return { success: false, error: 'Já existe um equipamento com esse número de frota.' };
  if (dupPlaca) return { success: false, error: 'Já existe um equipamento com essa placa ou identificação.' };

  if (currentId) {
    const index = items.findIndex((item) => item.id === currentId);
    if (index === -1) return { success: false, error: 'Equipamento não encontrado.' };
    items[index] = {
      ...items[index],
      ...normalized,
    };
    if (hasSupabaseConfig()) {
      const bloqueio = bloqueioLocalEquipamentos(items.length);
      if (bloqueio) return { success: false, error: bloqueio };
    }
    return executeWrite({
      shouldWriteRemote: hasSupabaseConfig(),
      writeRemote: () => writeSnapshotEquipamentos(items),
      writeLocal: () => writeAll(items),
      successData: items[index],
      fallbackMessage: 'Falha ao salvar equipamento no Supabase.',
    });
  }

  const created: Equipamento = {
    id: crypto.randomUUID(),
    ...normalized,
    dataCadastro: new Date().toISOString(),
  };
  items.push(created);
  if (hasSupabaseConfig()) {
    const bloqueio = bloqueioLocalEquipamentos(items.length);
    if (bloqueio) return { success: false, error: bloqueio };
  }
  return executeWrite({
    shouldWriteRemote: hasSupabaseConfig(),
    writeRemote: () => writeSnapshotEquipamentos(items),
    writeLocal: () => writeAll(items),
    successData: created,
    fallbackMessage: 'Falha ao salvar equipamento no Supabase.',
  });
}

export async function excluirEquipamento(id: string): Promise<ServiceResult<void>> {
  const items = await loadEquipamentos();
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) return { success: false, error: 'Equipamento não encontrado.' };
  if (hasSupabaseConfig()) {
    const bloqueio = bloqueioLocalEquipamentos(next.length);
    if (bloqueio) return { success: false, error: bloqueio };
  }
  return executeWrite({
    shouldWriteRemote: hasSupabaseConfig(),
    writeRemote: () => writeSnapshotEquipamentos(next),
    writeLocal: () => writeAll(next),
    successData: undefined,
    fallbackMessage: 'Falha ao excluir equipamento no Supabase.',
  });
}

export { diasAteFimContrato, labelSituacaoContrato, situacaoContratoFromDias };
export type { SituacaoContrato } from '../utils/equipamentoContrato';

export async function montarExportacaoEquipamentosCsv(filtro: EquipamentoFiltro): Promise<ServiceResult<{ csv: string; fileName: string }>> {
  const fallbackResult = await withLocalFallback({
    shouldTryRemote: hasSupabaseConfig(),
    loadRemote: () => readSnapshotEquipamentos(),
    loadLocal: () => readAll(),
    fallbackMessage: 'Falha ao consultar equipamentos no Supabase.',
  });
  const items = aplicarFiltrosListaEquipamentos(fallbackResult.data, filtro);
  const header = [
    'numero_frota',
    'tipo',
    'placa',
    'operador',
    'telefone',
    'setor',
    'empresa',
    'inicio_projeto',
    'fim_contrato',
    'valor_contrato',
    'numero_contrato',
    'situacao_contrato',
    'status_equipamento',
    'observacoes',
  ];
  const sep = ';';
  const linhas = [
    header.join(sep),
    ...items.map((item) => {
      const dias = diasAteFimContrato(item.dataFimContrato);
      const sit = situacaoContratoFromDias(dias);
      const row = [
        item.codigo,
        item.tipoEquipamento,
        item.placa,
        item.nomeOperador,
        item.telefoneOperador,
        item.setorResponsavel,
        item.empresaContratada,
        item.dataInicioProjeto,
        item.dataFimContrato,
        item.valorContrato != null ? formatDecimalExcelPtBr(Number(item.valorContrato)) : '',
        item.numeroContrato,
        labelSituacaoContrato(sit),
        item.statusEquipamento,
        item.observacoes,
      ];
      return row.map((c) => escapeCsvCellSemicolon(String(c))).join(sep);
    }),
  ];
  const csv = `\uFEFF${linhas.join('\r\n')}\r\n`;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = filtrosEquipamentosEstaoPadrao(filtro)
    ? `iso-pro-equipamentos-${stamp}.csv`
    : `iso-pro-equipamentos-filtrado-${stamp}.csv`;
  return { success: true, data: { csv, fileName }, meta: fallbackResult.meta };
}
