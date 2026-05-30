import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';
import { getActiveTenantId } from '../../../lib/isoProTenant';
import { avisarPreservacaoLocalStorageCorrupto } from '../../../lib/localStoragePreservacao';
import { escapeCsvCellSemicolon, formatDecimalExcelPtBr } from '../../../lib/csv';
import { invalidateIsoProSnapshotCache, readIsoProSnapshotPayload } from '../../../lib/isoProSnapshot';
import { mensagemSeSubstituirLocalPerderiaCadastros } from '../../../lib/localSnapshotWriteGuard';
import { fetchAllPagesFromSupabase, SUPABASE_FETCH_PAGE_SIZE } from '../../../lib/fetchAllSupabasePages';
import { getSupabase, hasSupabaseConfig, shouldUseCloudMaterials } from '../../../lib/supabase';
import { findMaterialComCodigoDuplicado } from '../utils/materiaisCodigoDuplicado';
import { whenBusinessWriteBlockedResult } from '../../../lib/writePolicy';
import {
  IMPORT_COOPERATIVE_MIN_CSV_ROWS,
  yieldCooperativeEveryRows,
  yieldToMain,
} from '../../../lib/yieldCooperativeImport';
import { buildSaldoMap, codigoMaterialKey, type SaldoSnapshotPayload } from '../../estoque/saldoFromSnapshot';
import type { PaginatedResult, ServiceResult } from '../../../types/common.types';
import { getCurrentUser } from '../../auth/services/auth.service';
import { appendAuthAuditEvent } from '../../auth/services/authAudit.service';
import type { Material, MaterialFiltro, MaterialFormData, MaterialListItem } from '../types/material.types';
import { parseMateriaisPersistidos } from '../schemas/materialPersistido.zod';
import { backfillCodigosBarrasMateriais } from '../utils/backfillCodigosBarrasMateriais';
import { backfillPercentualAlertaEstoqueMateriais } from '../utils/backfillPercentualAlertaEstoqueMateriais';
import { gerarProximoCodigoBarrasEan13 } from '../utils/gerarCodigoBarrasEan13';
import {
  construirDocumentoStagingImportacaoMateriais,
  validarDominiosCadastroImportacaoMateriais,
} from './materiais.import.pipeline';
import { readMateriaisDominiosListas, writeMateriaisDominiosListas } from './materiaisDominios.storage';

export {
  materialRegistroCsvParaFormData,
  serializarDocumentoStagingMateriais,
  validarDominiosCadastroImportacaoMateriais,
  validarImportacaoMaterialEmCamadas,
  valorPermitidoNaListaDominio,
} from './materiais.import.pipeline';
export type { MaterialImportStagingDocument, MaterialImportStagingLinha } from './materiais.import.pipeline';

function materiaisStorageKey(): string {
  return getScopedIsoProStorageKey('iso-pro-desktop-materiais');
}

/**
 * Cadastro de materiais — dois modos (ver `materiaisNuvem` em configuracoes / `shouldUseCloudMaterials`):
 *
 * - **Nuvem**: linhas na tabela Supabase `materiais`; `salvar` / exclusao / import nuvem nao reescrevem esta chave.
 * - **Local**: array JSON em `iso-pro-desktop-materiais`; `writeAll` substitui o ficheiro inteiro.
 *
 * Com Supabase ligado mas cadastro **local**, o risco e o mesmo dos outros modulos: `localStorage` pode ter
 * mais linhas "brutas" do que a lista valida que vamos gravar. A protecao abaixo bloqueia essa substituicao.
 * Atendimento que grava `MATERIAIS_KEY` a partir do snapshot ja e coberto em `atendimento.service.ts`.
 */
function bloqueioSubstituicaoTotalMateriaisLocal(tamanhoNovaLista: number): string | null {
  if (!hasSupabaseConfig()) return null;
  return mensagemSeSubstituirLocalPerderiaCadastros([
    { storageKey: materiaisStorageKey(), tamanhoNovaLista: tamanhoNovaLista, nomeCurto: 'material(is) do cadastro' },
  ]);
}

const seedData: Material[] = [
  {
    id: 'mat-1',
    codigo: 'TB-0001',
    codigoBarras: '',
    descricao: 'Tubo inox 2 polegadas',
    diametro: '2"',
    disciplina: 'Tubulacao',
    unidade: 'UN',
    peso: 12.5,
    estoqueMinimo: 10,
    saldoAtual: 18,
    ativo: true,
    observacao: 'Base inicial do modulo.',
  },
  {
    id: 'mat-2',
    codigo: 'EL-0102',
    codigoBarras: '',
    descricao: 'Cabo eletrico 10mm',
    diametro: '10mm',
    disciplina: 'Eletrica',
    unidade: 'M',
    peso: 0.35,
    estoqueMinimo: 200,
    saldoAtual: 120,
    ativo: true,
    observacao: '',
  },
  {
    id: 'mat-3',
    codigo: 'MT-0020',
    codigoBarras: '',
    descricao: 'Perfil metalico estrutural',
    diametro: '-',
    disciplina: 'Estruturas',
    unidade: 'BR',
    peso: 48,
    estoqueMinimo: 5,
    saldoAtual: 4,
    ativo: false,
    observacao: 'Item mantido para historico.',
  },
];

function readAll(): Material[] {
  const raw = localStorage.getItem(materiaisStorageKey());
  if (!raw) {
    let initial = seedData.map(normalizarMaterialLeitura);
    const bfCb = backfillCodigosBarrasMateriais(initial);
    if (bfCb.alterou) {
      initial = bfCb.next;
    }
    const bfPct = backfillPercentualAlertaEstoqueMateriais(initial);
    if (bfPct.alterou) {
      initial = bfPct.next;
    }
    localStorage.setItem(materiaisStorageKey(), JSON.stringify(initial));
    return initial;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const validated = parseMateriaisPersistidos(parsed);
    if (!validated) {
      avisarPreservacaoLocalStorageCorrupto('Materiais', materiaisStorageKey());
      return [];
    }
    const withNorm = validated.map(normalizarMaterialLeitura);
    let next = withNorm;
    let alterou = false;

    const bfCb = backfillCodigosBarrasMateriais(next);
    if (bfCb.alterou) {
      next = bfCb.next;
      alterou = true;
    }

    const bfPct = backfillPercentualAlertaEstoqueMateriais(next);
    if (bfPct.alterou) {
      next = bfPct.next;
      alterou = true;
    }

    if (alterou) {
      writeAll(next);
    }
    return next;
  } catch {
    avisarPreservacaoLocalStorageCorrupto('Materiais', materiaisStorageKey());
    return [];
  }
}

function writeAll(items: Material[]) {
  localStorage.setItem(materiaisStorageKey(), JSON.stringify(items));
}

function normalizarMaterialLeitura(m: Material): Material {
  return {
    ...m,
    codigoBarras: m.codigoBarras ?? '',
  };
}

function buildSearchText(item: Material) {
  return `${item.codigo} ${item.codigoBarras} ${item.descricao} ${item.disciplina}`.toLowerCase();
}

function toListItem(item: Material): MaterialListItem {
  return {
    id: item.id,
    codigo: item.codigo,
    codigoBarras: item.codigoBarras,
    descricao: item.descricao,
    disciplina: item.disciplina,
    unidade: item.unidade,
    peso: item.peso,
    estoqueMinimo: item.estoqueMinimo,
    saldoAtual: item.saldoAtual,
    ativo: item.ativo,
  };
}

type RemoteMaterialRow = {
  id: number;
  codigo: string;
  codigo_barras?: string | null;
  descricao: string | null;
  diametro: string | null;
  disciplina: string | null;
  unidade: string | null;
  peso: number | null;
  estoque_minimo: number | null;
  ativo?: boolean | null;
};

function mapRemoteMaterial(row: RemoteMaterialRow): Material {
  return {
    id: String(row.id),
    codigo: row.codigo,
    codigoBarras: row.codigo_barras?.trim() ?? '',
    descricao: row.descricao ?? '',
    diametro: row.diametro ?? '',
    disciplina: row.disciplina ?? '',
    unidade: row.unidade ?? 'UN',
    peso: row.peso ?? 0,
    estoqueMinimo: row.estoque_minimo ?? 0,
    saldoAtual: 0,
    ativo: row.ativo !== false,
    observacao: '',
  };
}

async function listRemoteMaterials(): Promise<Material[]> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase nao configurado.');
  }

  const tenantId = getActiveTenantId();
  const selectCols = 'id,codigo,codigo_barras,descricao,diametro,disciplina,unidade,peso,estoque_minimo,ativo';

  const items = await fetchAllPagesFromSupabase(async (offset, pageSize) => {
    const { data, error } = await supabase
      .from('materiais')
      .select(selectCols)
      .eq('tenant_id', tenantId)
      .order('codigo', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map((row) => mapRemoteMaterial(row as RemoteMaterialRow));
  }, SUPABASE_FETCH_PAGE_SIZE);
  let next = items;
  let alterou = false;

  const bfCb = backfillCodigosBarrasMateriais(next);
  if (bfCb.alterou) {
    next = bfCb.next;
    alterou = true;
  }

  const bfPct = backfillPercentualAlertaEstoqueMateriais(next);
  if (bfPct.alterou) {
    next = bfPct.next;
    alterou = true;
  }

  if (!alterou) {
    return next;
  }

  const porId = new Map(items.map((m) => [m.id, m]));
  for (const m of next) {
    const antigo = porId.get(m.id);
    if (!antigo) continue;

    const updates: { codigo_barras?: string; estoque_minimo?: number } = {};
    if (antigo.codigoBarras !== m.codigoBarras) {
      updates.codigo_barras = m.codigoBarras;
    }
    if (antigo.estoqueMinimo !== m.estoqueMinimo) {
      updates.estoque_minimo = m.estoqueMinimo;
    }
    if (Object.keys(updates).length === 0) continue;

    const { error: upErr } = await supabase
      .from('materiais')
      .update(updates)
      .eq('id', Number(m.id))
      .eq('tenant_id', getActiveTenantId());
    if (upErr) {
      throw new Error(upErr.message);
    }
  }

  return next;
}

async function getNextMaterialId() {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase nao configurado.');
  }

  // Sequencia por tenant; PK na base e (tenant_id, id) — ver migracao 20260530220000.
  const { data, error } = await supabase
    .from('materiais')
    .select('id')
    .eq('tenant_id', getActiveTenantId())
    .order('id', { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  return Number(data?.[0]?.id ?? 0) + 1;
}

async function fetchMaxMaterialIdRemote(): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase nao configurado.');
  }
  const { data, error } = await supabase
    .from('materiais')
    .select('id')
    .eq('tenant_id', getActiveTenantId())
    .order('id', { ascending: false })
    .limit(1);
  if (error) {
    throw new Error(error.message);
  }
  return Number(data?.[0]?.id ?? 0);
}

/** Insercoes em massa na tabela remota (menos round-trips que um insert por linha). */
const IMPORT_MATERIAIS_CHUNK_INSERT = 400;
/** Atualizacoes em paralelo controlado (evita saturar rede / limites). */
const IMPORT_MATERIAIS_PARALLEL_UPDATES = 20;

type PreparedMateriaisLinha = {
  numeroLinha: number;
  form: MaterialFormData;
  key: string;
  existing: Material | undefined;
  antes: string;
};

function formParaPayloadNuvem(form: MaterialFormData, codigoBarras: string) {
  return {
    codigo: form.codigo.trim(),
    codigo_barras: codigoBarras,
    descricao: form.descricao.trim(),
    diametro: form.diametro.trim(),
    disciplina: form.disciplina.trim(),
    unidade: form.unidade.trim(),
    peso: form.peso,
    estoque_minimo: form.estoqueMinimo,
    ativo: form.ativo,
  };
}

async function loadMateriaisBase(): Promise<Material[]> {
  return shouldUseCloudMaterials() ? await listRemoteMaterials().catch(() => readAll()) : readAll();
}

/**
 * Saldo operacional a partir do snapshot `iso_pro_snapshot` (recebimentos, documentos, ajustes).
 * Importante: corre sempre que ha Supabase — nao exige «materiais na nuvem»; o cadastro pode ser local
 * e o saldo ainda vem do movimento consolidado na nuvem (mesma regra do atendimento).
 */
async function aplicarSaldoCalculadoNosMateriais(materiais: Material[]): Promise<Material[]> {
  if (!hasSupabaseConfig()) {
    return materiais;
  }
  try {
    const payload = await readIsoProSnapshotPayload<SaldoSnapshotPayload>();
    const saldoMap = buildSaldoMap(payload);
    return materiais.map((m) => ({
      ...m,
      saldoAtual: saldoMap.get(codigoMaterialKey(m.codigo)) ?? 0,
    }));
  } catch {
    return materiais;
  }
}

/** Cadastro completo (Supabase ou local). Usado pelo atendimento para alinhar saldo ao snapshot. */
export async function carregarMateriaisDoCadastro(): Promise<Material[]> {
  return loadMateriaisBase();
}

export type SincronizarMateriaisNuvemParaLocalOpcoes = {
  /** Login para auditoria. */
  actorLogin?: string;
  /**
   * Ignora o bloqueio quando o `localStorage` deste navegador tem mais linhas que a lista vinda da nuvem.
   * Usar apenas apos exportar backup e confirmar que linhas extra podem ser descartadas.
   */
  forcar?: boolean;
};

/**
 * Copia o cadastro actual da tabela Supabase `materiais` para `iso-pro-desktop-materiais`, com `saldoAtual`
 * alinhado ao snapshot (quando Supabase esta configurado). Exige materiais em nuvem activos.
 *
 * Por defeito aplica o mesmo guarda que outras gravacoes locais: se o navegador tiver mais linhas brutas
 * guardadas do que a lista da nuvem, devolve erro e `meta.syncMateriaisLocalBloqueado`; use `forcar: true`
 * na segunda tentativa apos confirmacao na UI.
 */
export async function sincronizarMateriaisNuvemParaArmazenamentoLocal(
  opcoes?: SincronizarMateriaisNuvemParaLocalOpcoes,
): Promise<ServiceResult<{ total: number }>> {
  if (!hasSupabaseConfig()) {
    return { success: false, error: 'Supabase nao esta configurado (URL e chave em Configuracoes).' };
  }
  if (!shouldUseCloudMaterials()) {
    return {
      success: false,
      error:
        'Cadastro na nuvem desligado: em Configuracoes, active "materiais na nuvem" para poder gravar esta copia local a partir da tabela.',
    };
  }

  try {
    const items = await aplicarSaldoCalculadoNosMateriais(await listRemoteMaterials());
    if (!opcoes?.forcar) {
      const bloqueio = bloqueioSubstituicaoTotalMateriaisLocal(items.length);
      if (bloqueio) {
        return {
          success: false,
          error: bloqueio,
          meta: { syncMateriaisLocalBloqueado: true },
        };
      }
    }
    writeAll(items);
    invalidateIsoProSnapshotCache();
    const actor = opcoes?.actorLogin?.trim() || getCurrentUser()?.login || 'desconhecido';
    appendAuthAuditEvent({
      type: 'materiais_copia_local_desde_nuvem',
      actorLogin: actor,
      detail: `Gravada copia local com ${items.length} material(is) a partir da nuvem${opcoes?.forcar ? ' (substituicao forcada).' : '.'}`,
    });
    return { success: true, data: { total: items.length } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Nao foi possivel ler o cadastro de materiais na nuvem.',
    };
  }
}

/**
 * Resolve material pelo codigo interno (exato, ignorando maiusculas) ou pelo codigo de barras (apenas digitos).
 * Usado no atendimento com leitor. Materiais inativos nao sao retornados.
 */
export async function buscarMaterialPorLeituraCodigo(scan: string): Promise<ServiceResult<Material | null>> {
  const q = scan.trim();
  if (!q) return { success: true, data: null };
  const base = await loadMateriaisBase();
  const qLower = q.toLowerCase();
  for (const m of base) {
    if (!m.ativo) continue;
    if (m.codigo.trim().toLowerCase() === qLower) {
      return { success: true, data: m };
    }
  }
  const digits = q.replace(/\D/g, '');
  if (digits.length >= 8) {
    for (const m of base) {
      if (!m.ativo) continue;
      const b = m.codigoBarras?.replace(/\D/g, '') ?? '';
      if (b.length > 0 && b === digits) {
        return { success: true, data: m };
      }
    }
  }
  return { success: true, data: null };
}

/** Codigo do material (trim + lower) -> peso unitario (kg) no cadastro. Usado em recebimentos para preencher peso quando a linha esta zerada. */
export async function construirIndicePesoPorCodigoMaterial(): Promise<Map<string, number>> {
  const base = await loadMateriaisBase();
  const map = new Map<string, number>();
  for (const m of base) {
    const key = m.codigo.trim().toLowerCase();
    if (!key) continue;
    map.set(key, Number(m.peso) || 0);
  }
  return map;
}

export type MaterialDisciplinaUnidadePorCodigo = { disciplina: string; unidade: string };

/** Codigo do material (trim + lower) -> disciplina e unidade no cadastro. Usado em recebimentos para preencher linhas importadas sem esses campos. */
export async function construirIndiceDisciplinaUnidadePorCodigoMaterial(): Promise<
  Map<string, MaterialDisciplinaUnidadePorCodigo>
> {
  const base = await loadMateriaisBase();
  const map = new Map<string, MaterialDisciplinaUnidadePorCodigo>();
  for (const m of base) {
    const key = m.codigo.trim().toLowerCase();
    if (!key) continue;
    map.set(key, {
      disciplina: String(m.disciplina ?? '').trim(),
      unidade: String(m.unidade ?? '').trim(),
    });
  }
  return map;
}

export function aplicarFiltrosMateriais(items: Material[], filtro: MaterialFiltro): Material[] {
  let filtered = items;

  if (filtro.busca.trim()) {
    const busca = filtro.busca.trim().toLowerCase();
    filtered = filtered.filter((item) => buildSearchText(item).includes(busca));
  }

  if (filtro.disciplina) {
    filtered = filtered.filter((item) => item.disciplina === filtro.disciplina);
  }

  if (filtro.ativo === 'ativos') {
    filtered = filtered.filter((item) => item.ativo);
  }

  if (filtro.ativo === 'inativos') {
    filtered = filtered.filter((item) => !item.ativo);
  }

  return [...filtered].sort((a, b) => a.codigo.localeCompare(b.codigo));
}

export async function listarMateriais(filtro: MaterialFiltro): Promise<ServiceResult<PaginatedResult<MaterialListItem>>> {
  const base = await aplicarSaldoCalculadoNosMateriais(await loadMateriaisBase());
  const items = aplicarFiltrosMateriais(base, filtro);

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
  };
}

function resolverCodigoBarrasParaSalvar(
  payload: MaterialFormData,
  base: Material[],
  currentId?: string,
): { codigoBarras: string } | { error: string } {
  const existing = currentId ? base.find((m) => m.id === currentId) : undefined;
  let cb = payload.codigoBarras?.trim() ?? '';
  if (!cb) {
    cb = existing?.codigoBarras?.trim() ?? '';
  }
  if (!cb) {
    try {
      cb = gerarProximoCodigoBarrasEan13(base);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Falha ao gerar codigo de barras.' };
    }
  }
  const dup = base.find((m) => m.codigoBarras === cb && m.id !== currentId);
  if (dup) {
    return { error: 'Ja existe outro material com este codigo de barras.' };
  }
  return { codigoBarras: cb };
}

export async function salvarMaterial(
  payload: MaterialFormData,
  currentId?: string,
): Promise<ServiceResult<Material>> {
  const base = await loadMateriaisBase();
  const codigoBarrasResolvido = resolverCodigoBarrasParaSalvar(payload, base, currentId);
  if ('error' in codigoBarrasResolvido) {
    return { success: false, error: codigoBarrasResolvido.error };
  }
  const codigoBarras = codigoBarrasResolvido.codigoBarras;

  const duplicated = findMaterialComCodigoDuplicado(base, payload.codigo, currentId);
  if (duplicated) {
    return { success: false, error: 'Ja existe um material com esse codigo.' };
  }

  if (shouldUseCloudMaterials()) {
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase nao configurado.');

      const normalizedPayload = {
        codigo: payload.codigo.trim(),
        codigo_barras: codigoBarras,
        descricao: payload.descricao.trim(),
        diametro: payload.diametro.trim(),
        disciplina: payload.disciplina.trim(),
        unidade: payload.unidade.trim(),
        peso: payload.peso,
        estoque_minimo: payload.estoqueMinimo,
        ativo: payload.ativo,
      };

      if (currentId) {
        const { data, error } = await supabase
          .from('materiais')
          .update(normalizedPayload)
          .eq('id', Number(currentId))
          .eq('tenant_id', getActiveTenantId())
          .select('id,codigo,codigo_barras,descricao,diametro,disciplina,unidade,peso,estoque_minimo,ativo')
          .single();

        if (error) return { success: false, error: error.message };
        return { success: true, data: mapRemoteMaterial(data as RemoteMaterialRow) };
      }

      const nextId = await getNextMaterialId();
      const { data, error } = await supabase
        .from('materiais')
        .insert({ id: nextId, tenant_id: getActiveTenantId(), ...normalizedPayload })
        .select('id,codigo,codigo_barras,descricao,diametro,disciplina,unidade,peso,estoque_minimo,ativo')
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, data: mapRemoteMaterial(data as RemoteMaterialRow) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Falha ao salvar no Supabase.' };
    }
  }

  const items = readAll();
  const blockedMat = whenBusinessWriteBlockedResult<Material>();
  if (blockedMat) return blockedMat;

  if (currentId) {
    const index = items.findIndex((item) => item.id === currentId);
    if (index === -1) return { success: false, error: 'Material nao encontrado.' };

    items[index] = {
      ...items[index],
      ...payload,
      codigo: payload.codigo.trim(),
      descricao: payload.descricao.trim(),
      codigoBarras,
    };
    const bloqueioMatEdit = bloqueioSubstituicaoTotalMateriaisLocal(items.length);
    if (bloqueioMatEdit) return { success: false, error: bloqueioMatEdit };
    writeAll(items);
    return { success: true, data: items[index] };
  }

  const created: Material = {
    id: crypto.randomUUID(),
    saldoAtual: 0,
    ...payload,
    codigo: payload.codigo.trim(),
    descricao: payload.descricao.trim(),
    codigoBarras,
  };

  items.push(created);
  const bloqueioMatNovo = bloqueioSubstituicaoTotalMateriaisLocal(items.length);
  if (bloqueioMatNovo) return { success: false, error: bloqueioMatNovo };
  writeAll(items);

  return { success: true, data: created };
}

/**
 * Recebimentos / documentos: bloqueia codigo inexistente ou material inativo (mesma base que o cadastro em uso).
 */
export async function validarCodigosMateriaisAtivosNoCadastroParaRecebimento(
  codigos: string[],
  modo: 'import' | 'salvar' = 'salvar',
  modulo: 'recebimento' | 'documento' = 'recebimento',
): Promise<string | null> {
  const unique = [...new Set(codigos.map((c) => c.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  );
  if (!unique.length) {
    return modo === 'import'
      ? 'Importacao nao concluida. Nenhum codigo de material valido nas linhas do arquivo.'
      : modulo === 'documento'
        ? 'Adicione ao menos um item com codigo de material cadastrado e ativo.'
        : 'Informe ao menos um material com codigo valido.';
  }

  const base = await loadMateriaisBase();
  const porCodigo = new Map<string, Material>();
  for (const m of base) {
    const k = m.codigo.trim().toLowerCase();
    if (k) porCodigo.set(k, m);
  }

  const naoCadastrados: string[] = [];
  const inativos: string[] = [];
  for (const c of unique) {
    const k = c.toLowerCase();
    const m = porCodigo.get(k);
    if (!m) naoCadastrados.push(c);
    else if (!m.ativo) inativos.push(c);
  }

  if (naoCadastrados.length === 0 && inativos.length === 0) return null;

  const detalhes: string[] = [];
  if (naoCadastrados.length) {
    detalhes.push(`codigo(s) nao cadastrado(s): ${naoCadastrados.map((x) => `"${x}"`).join(', ')}`);
  }
  if (inativos.length) {
    detalhes.push(`codigo(s) inativo(s) no cadastro: ${inativos.map((x) => `"${x}"`).join(', ')}`);
  }
  const corpo = `${detalhes.join(' ')} Cadastre ou reative em Materiais`;
  if (modo === 'import') {
    return `Importacao nao concluida. ${corpo} e tente novamente.`;
  }
  const alvo = modulo === 'documento' ? 'documento' : 'recebimento';
  return `${corpo} antes de salvar o ${alvo}.`;
}

export async function toggleMaterialStatus(id: string, ativo: boolean): Promise<ServiceResult<Material>> {
  if (shouldUseCloudMaterials()) {
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase nao configurado.');

      const { data, error } = await supabase
        .from('materiais')
        .update({ ativo })
        .eq('id', Number(id))
        .eq('tenant_id', getActiveTenantId())
        .select('id,codigo,codigo_barras,descricao,diametro,disciplina,unidade,peso,estoque_minimo,ativo')
        .single();

      if (error) return { success: false, error: error.message };

      const row = data as RemoteMaterialRow & { ativo?: boolean | null };
      return {
        success: true,
        data: {
          ...mapRemoteMaterial(row),
          ativo: Boolean(row.ativo),
        },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Falha ao atualizar material.' };
    }
  }

  const items = readAll();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return { success: false, error: 'Material nao encontrado.' };

  const blockedToggle = whenBusinessWriteBlockedResult<Material>();
  if (blockedToggle) return blockedToggle;

  items[index] = { ...items[index], ativo };
  const bloqueioMatToggle = bloqueioSubstituicaoTotalMateriaisLocal(items.length);
  if (bloqueioMatToggle) return { success: false, error: bloqueioMatToggle };
  writeAll(items);

  return { success: true, data: items[index] };
}

/** IDs de todos os materiais que correspondem ao filtro (ignora paginacao). */
export async function obterIdsMateriaisFiltrados(filtro: MaterialFiltro): Promise<ServiceResult<string[]>> {
  try {
    const base = await loadMateriaisBase();
    const items = aplicarFiltrosMateriais(base, filtro);
    return { success: true, data: items.map((m) => m.id) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Falha ao listar materiais.' };
  }
}

/** Codigos internos dos materiais com os IDs indicados (para confirmacao na UI). Ordenado por codigo. */
export async function obterCodigosMateriaisPorIds(ids: string[]): Promise<ServiceResult<string[]>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return { success: true, data: [] };
  try {
    const base = await loadMateriaisBase();
    const idSet = new Set(unique);
    const codigos: string[] = [];
    for (const m of base) {
      if (idSet.has(m.id)) {
        const c = m.codigo.trim();
        codigos.push(c || m.id);
      }
    }
    codigos.sort((a, b) => a.localeCompare(b));
    return { success: true, data: codigos };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Falha ao carregar codigos.' };
  }
}

/** Mapa id do material → codigo interno (para cruzar com outros modulos). */
export async function obterMapeamentoCodigoPorIdMaterial(ids: string[]): Promise<ServiceResult<Record<string, string>>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return { success: true, data: {} };
  try {
    const base = await loadMateriaisBase();
    const idSet = new Set(unique);
    const out: Record<string, string> = {};
    for (const m of base) {
      if (idSet.has(m.id)) {
        out[m.id] = m.codigo.trim() || m.id;
      }
    }
    return { success: true, data: out };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Falha ao carregar codigos por id.',
    };
  }
}

function mensagemErroExclusaoMateriais(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('23503') || m.includes('foreign key') || m.includes('violates foreign key')) {
    return 'Nao foi possivel excluir: um ou mais materiais estao referenciados em outros registros.';
  }
  return message;
}

/** Remove linhas do cadastro (Supabase ou local). Requer confirmacao de senha na UI; apenas perfil com permissao administrar. */
export async function excluirMateriaisDefinitivamente(ids: string[]): Promise<ServiceResult<{ removidos: number }>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) {
    return { success: false, error: 'Nenhum material selecionado.' };
  }

  const actorLogin = getCurrentUser()?.login ?? 'desconhecido';

  if (shouldUseCloudMaterials()) {
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase nao configurado.');
      const numericIds = unique.map((id) => Number(id)).filter((n) => Number.isFinite(n));
      if (numericIds.length !== unique.length) {
        return { success: false, error: 'IDs de material invalidos.' };
      }

      const {
        analisarUsoMateriaisPorIds,
        formatarUsoMateriaisResumoTexto,
      } = await import('./materiaisReferencias.service');
      const usoPre = await analisarUsoMateriaisPorIds(unique);
      if (!usoPre.success) {
        return {
          success: false,
          error:
            'Nuvem: nao foi possivel concluir a analise de referencias antes de excluir. Verifique a ligacao e tente novamente.',
        };
      }
      const temUso = (usoPre.data ?? []).some(
        (u) => u.recebimentos || u.documentos || u.atendimento,
      );
      if (temUso) {
        const det = formatarUsoMateriaisResumoTexto(usoPre.data ?? []);
        return {
          success: false,
          error: `Nuvem: exclusao bloqueada — o codigo ainda consta em outros modulos.\n\n${det}`,
        };
      }

      const { error } = await supabase.from('materiais').delete().eq('tenant_id', getActiveTenantId()).in('id', numericIds);
      if (error) {
        return { success: false, error: mensagemErroExclusaoMateriais(error.message) };
      }
      invalidateIsoProSnapshotCache();
      appendAuthAuditEvent({
        type: 'materiais_excluidos_definitivamente',
        actorLogin,
        detail: `Excluidos ${numericIds.length} material(is) na nuvem. IDs: ${numericIds.slice(0, 80).join(',')}${numericIds.length > 80 ? '...' : ''}`,
      });
      return { success: true, data: { removidos: numericIds.length } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? mensagemErroExclusaoMateriais(error.message) : 'Falha ao excluir materiais.',
      };
    }
  }

  const all = readAll();
  const idSet = new Set(unique);
  const next = all.filter((m) => !idSet.has(m.id));
  const removidos = all.length - next.length;
  if (!removidos) {
    return { success: false, error: 'Nenhum material encontrado para excluir.' };
  }
  const blockedExcluirMat = whenBusinessWriteBlockedResult<{ removidos: number }>();
  if (blockedExcluirMat) return blockedExcluirMat;
  writeAll(next);
  invalidateIsoProSnapshotCache();
  appendAuthAuditEvent({
    type: 'materiais_excluidos_definitivamente',
    actorLogin,
    detail: `Excluidos ${removidos} material(is) localmente. IDs: ${unique.slice(0, 80).join(',')}${unique.length > 80 ? '...' : ''}`,
  });
  return { success: true, data: { removidos } };
}

function mergeDominiosComValoresEmUso(dominio: string[], emUso: string[]): string[] {
  const set = new Set<string>();
  for (const s of dominio) {
    const t = s.trim();
    if (t) set.add(t);
  }
  for (const s of emUso) {
    const t = s.trim();
    if (t) set.add(t);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** Disciplinas: lista configurada + valores ja usados em materiais (filtros e formulario). */
export async function listarDisciplinas(): Promise<string[]> {
  const items = shouldUseCloudMaterials() ? await listRemoteMaterials().catch(() => readAll()) : readAll();
  const emUso = items.map((item) => item.disciplina);
  const dom = readMateriaisDominiosListas();
  return mergeDominiosComValoresEmUso(dom.disciplinas, emUso);
}

/** Unidades: lista configurada + valores ja usados em materiais. */
export async function listarUnidadesCadastro(): Promise<string[]> {
  const items = shouldUseCloudMaterials() ? await listRemoteMaterials().catch(() => readAll()) : readAll();
  const emUso = items.map((m) => m.unidade);
  const dom = readMateriaisDominiosListas();
  return mergeDominiosComValoresEmUso(dom.unidades, emUso);
}

/** Listas gravadas pelo utilizador (edicao nos modais Disciplinas / Unidades). */
export function obterListasDominioMateriaisArmazenadas() {
  return readMateriaisDominiosListas();
}

export function salvarDominiosDisciplinasMateriais(disciplinas: string[]): void {
  if (whenBusinessWriteBlockedResult<void>()) return;
  const cur = readMateriaisDominiosListas();
  writeMateriaisDominiosListas({ ...cur, disciplinas });
}

export function salvarDominiosUnidadesMateriais(unidades: string[]): void {
  if (whenBusinessWriteBlockedResult<void>()) return;
  const cur = readMateriaisDominiosListas();
  writeMateriaisDominiosListas({ ...cur, unidades });
}

export async function buscarMaterialPorId(id: string): Promise<ServiceResult<Material>> {
  if (shouldUseCloudMaterials()) {
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase nao configurado.');
      const { data, error } = await supabase
        .from('materiais')
        .select('id,codigo,codigo_barras,descricao,diametro,disciplina,unidade,peso,estoque_minimo,ativo')
        .eq('id', Number(id))
        .eq('tenant_id', getActiveTenantId())
        .single();
      if (error) return { success: false, error: error.message };
      const mat = mapRemoteMaterial(data as RemoteMaterialRow);
      const [comSaldo] = await aplicarSaldoCalculadoNosMateriais([mat]);
      return { success: true, data: comSaldo };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Falha ao carregar material.' };
    }
  }

  const item = readAll().find((material) => material.id === id);
  if (!item) return { success: false, error: 'Material nao encontrado.' };
  return { success: true, data: item };
}

export type MateriaisImportacaoResumo = {
  criados: number;
  atualizados: number;
  ignorados: number;
  /** Linhas ignoradas por codigo repetido no mesmo arquivo (alem de erros de validacao). */
  ignoradosPorDuplicidadeNoArquivo: number;
  detalhes: string[];
};

type ExportacaoMateriaisOpcoes = {
  filtroLista?: MaterialFiltro;
};

function exportacaoMateriaisUsaFiltroRestrito(filtro: MaterialFiltro | undefined) {
  return Boolean(
    filtro && (filtro.busca.trim() !== '' || filtro.disciplina !== '' || filtro.ativo !== 'todos'),
  );
}

function snapshotMaterialResumo(m: Material): string {
  const d = m.descricao.length > 60 ? `${m.descricao.slice(0, 60)}...` : m.descricao;
  return `desc=${d} disc=${m.disciplina} um=${m.unidade} min=${m.estoqueMinimo} ativo=${m.ativo ? 'sim' : 'nao'}`;
}

function montarDetalheAuditoriaImportMateriais(
  criados: number,
  atualizados: number,
  ignorados: number,
  amostras: { codigo: string; tipo: 'criado' | 'atualizado'; antes: string; depois: string }[],
): string {
  const base = `Import CSV materiais: ${criados} criados, ${atualizados} atualizados, ${ignorados} ignorados.`;
  if (amostras.length === 0) {
    return base;
  }
  const partes = amostras.map((a) =>
    a.tipo === 'criado'
      ? `${a.codigo} criado [${a.depois}]`
      : `${a.codigo} atualizado: ${a.antes} -> ${a.depois}`,
  );
  return `${base} Amostras: ${partes.join(' | ')}`;
}

/**
 * CSV modelo para importacao (cabecalho + linhas de exemplo). Separador `;`, UTF-8 com BOM.
 * Colunas alinhadas ao importador (sem saldo_atual, calculado pelo sistema).
 */
export function montarModeloCsvImportacaoMateriais(): { csv: string; fileName: string } {
  const sep = ';';
  const header = [
    'codigo',
    'codigo_barras',
    'descricao',
    'diametro',
    'disciplina',
    'unidade',
    'peso',
    'estoque_minimo',
    'ativo',
    'observacao',
  ];
  const rows: string[][] = [
    ['TB-0001', '', 'Tubo inox 2 pol', '2"', 'Tubulacao', 'UN', '2,5', '5', 'sim', 'Exemplo linha 1'],
    ['EL-0102', '', 'Cabo eletrico 10mm', '', 'Eletrica', 'M', '0,15', '0', 'sim', 'Exemplo linha 2'],
  ];
  const lines = [
    header.join(sep),
    ...rows.map((r) => r.map((c) => escapeCsvCellSemicolon(c)).join(sep)),
  ];
  const csv = `\uFEFF${lines.join('\r\n')}\r\n`;
  return { csv, fileName: 'iso-pro-materiais-modelo-importacao.csv' };
}

export async function montarExportacaoMateriaisCsv(
  opcoes?: ExportacaoMateriaisOpcoes,
): Promise<ServiceResult<{ csv: string; fileName: string }>> {
  const base = await aplicarSaldoCalculadoNosMateriais(await loadMateriaisBase());
  const filtroLista =
    opcoes?.filtroLista ??
    ({
      busca: '',
      disciplina: '',
      ativo: 'todos',
      page: 1,
      pageSize: 999999,
    } as MaterialFiltro);
  const items = aplicarFiltrosMateriais(base, filtroLista);

  const header = [
    'codigo',
    'codigo_barras',
    'descricao',
    'diametro',
    'disciplina',
    'unidade',
    'peso',
    'estoque_minimo',
    'saldo_atual',
    'ativo',
    'observacao',
  ];

  const sep = ';';
  const linhas = [
    header.join(sep),
    ...items.map((m) =>
      [
        m.codigo,
        m.codigoBarras,
        m.descricao,
        m.diametro,
        m.disciplina,
        m.unidade,
        formatDecimalExcelPtBr(Number(m.peso)),
        formatDecimalExcelPtBr(Number(m.estoqueMinimo)),
        formatDecimalExcelPtBr(Number(m.saldoAtual)),
        m.ativo ? 'sim' : 'nao',
        m.observacao,
      ]
        .map((c) => escapeCsvCellSemicolon(String(c)))
        .join(sep),
    ),
  ];

  const csv = `\uFEFF${linhas.join('\r\n')}\r\n`;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const sufixo = exportacaoMateriaisUsaFiltroRestrito(opcoes?.filtroLista) ? '-filtrado' : '';
  const fileName = `iso-pro-materiais-${stamp}${sufixo}.csv`;
  return { success: true, data: { csv, fileName } };
}

export type ImportarMateriaisCsvOpcoes = {
  /** Login do usuario para auditoria (quem importou). */
  actorLogin?: string;
};

/** Leitura previa do CSV (contagem de linhas de dados) antes de confirmar importacao na UI. */
export function previewImportacaoMateriaisCsv(text: string): { ok: true; linhaCount: number } | { ok: false; error: string } {
  const { documento, erroEstrutural } = construirDocumentoStagingImportacaoMateriais(text);
  if (erroEstrutural || !documento) {
    return { ok: false, error: erroEstrutural ?? 'CSV invalido ou sem linhas de dados.' };
  }
  const domErr = validarDominiosCadastroImportacaoMateriais(documento);
  if (domErr) {
    return { ok: false, error: domErr };
  }
  return { ok: true, linhaCount: documento.linhas.length };
}

async function importarMateriaisCsvLocalEmLote(
  prepared: PreparedMateriaisLinha[],
  amostrasAuditoria: { codigo: string; tipo: 'criado' | 'atualizado'; antes: string; depois: string }[],
): Promise<ServiceResult<MateriaisImportacaoResumo>> {
  const bloqueado = whenBusinessWriteBlockedResult<MateriaisImportacaoResumo>();
  if (bloqueado) return bloqueado;

  const detalhes: string[] = [];
  let criados = 0;
  let atualizados = 0;
  let ignorados = 0;

  const base = await loadMateriaisBase();
  const working = base.map((m) => ({ ...m }));
  const byCodigo = new Map(working.map((m) => [m.codigo.toLowerCase(), m]));
  const cooperativeLocal = prepared.length >= IMPORT_COOPERATIVE_MIN_CSV_ROWS;

  for (let idx = 0; idx < prepared.length; idx++) {
    const p = prepared[idx];
    const existing = byCodigo.get(p.key);
    const cbRes = resolverCodigoBarrasParaSalvar(p.form, working, existing?.id);
    if ('error' in cbRes) {
      detalhes.push(`Linha ${p.numeroLinha} (${p.form.codigo}): ${cbRes.error}`);
      ignorados += 1;
      continue;
    }
    const codigoBarras = cbRes.codigoBarras;

    if (existing) {
      const index = working.findIndex((item) => item.id === existing.id);
      if (index === -1) {
        detalhes.push(`Linha ${p.numeroLinha} (${p.form.codigo}): material nao encontrado na base.`);
        ignorados += 1;
        continue;
      }
      working[index] = {
        ...working[index],
        ...p.form,
        codigo: p.form.codigo.trim(),
        descricao: p.form.descricao.trim(),
        codigoBarras,
        observacao: p.form.observacao?.trim() ?? '',
      };
      byCodigo.set(p.key, working[index]);
      const depois = snapshotMaterialResumo(working[index]);
      atualizados += 1;
      detalhes.push(`${p.form.codigo}: atualizado.`);
      if (amostrasAuditoria.length < 8) {
        amostrasAuditoria.push({ codigo: p.form.codigo, tipo: 'atualizado', antes: p.antes, depois });
      }
    } else {
      const created: Material = {
        id: crypto.randomUUID(),
        saldoAtual: 0,
        ...p.form,
        codigo: p.form.codigo.trim(),
        descricao: p.form.descricao.trim(),
        codigoBarras,
        observacao: p.form.observacao?.trim() ?? '',
      };
      working.push(created);
      byCodigo.set(p.key, created);
      const depois = snapshotMaterialResumo(created);
      criados += 1;
      detalhes.push(`${p.form.codigo}: incluido.`);
      if (amostrasAuditoria.length < 8) {
        amostrasAuditoria.push({ codigo: p.form.codigo, tipo: 'criado', antes: p.antes, depois });
      }
    }

    if (cooperativeLocal) {
      await yieldCooperativeEveryRows(idx);
    }
  }

  const bloqueioMatImport = bloqueioSubstituicaoTotalMateriaisLocal(working.length);
  if (bloqueioMatImport) {
    return { success: false, error: bloqueioMatImport };
  }
  writeAll(working);

  return {
    success: true,
    data: {
      criados,
      atualizados,
      ignorados,
      ignoradosPorDuplicidadeNoArquivo: 0,
      detalhes,
    },
  };
}

type InsertMateriaisNuvemOp = {
  numeroLinha: number;
  codigo: string;
  row: Record<string, unknown>;
};

type UpdateMateriaisNuvemOp = {
  numeroLinha: number;
  codigo: string;
  id: number;
  payload: ReturnType<typeof formParaPayloadNuvem>;
};

async function importarMateriaisCsvNuvemEmLotes(
  prepared: PreparedMateriaisLinha[],
  amostrasAuditoria: { codigo: string; tipo: 'criado' | 'atualizado'; antes: string; depois: string }[],
): Promise<ServiceResult<MateriaisImportacaoResumo>> {
  const supabase = getSupabase();
  if (!supabase) {
    return { success: false, error: 'Supabase nao configurado.' };
  }

  const detalhes: string[] = [];
  let criados = 0;
  let atualizados = 0;
  let ignorados = 0;

  const base = await listRemoteMaterials().catch(() => readAll());
  const working = base.map((m) => ({ ...m }));
  const byCodigo = new Map(working.map((m) => [m.codigo.toLowerCase(), m]));
  let nextId = (await fetchMaxMaterialIdRemote()) + 1;

  const inserts: InsertMateriaisNuvemOp[] = [];
  const updates: UpdateMateriaisNuvemOp[] = [];
  const cooperativeNuvem = prepared.length >= IMPORT_COOPERATIVE_MIN_CSV_ROWS;

  for (const p of prepared) {
    const existing = byCodigo.get(p.key);
    const cbRes = resolverCodigoBarrasParaSalvar(p.form, working, existing?.id);
    if ('error' in cbRes) {
      detalhes.push(`Linha ${p.numeroLinha} (${p.form.codigo}): ${cbRes.error}`);
      ignorados += 1;
      continue;
    }
    const payload = formParaPayloadNuvem(p.form, cbRes.codigoBarras);

    if (existing) {
      updates.push({
        numeroLinha: p.numeroLinha,
        codigo: p.form.codigo,
        id: Number(existing.id),
        payload,
      });
      const idx = working.findIndex((m) => m.id === existing.id);
      const merged = mapRemoteMaterial({
        id: Number(existing.id),
        codigo: payload.codigo,
        codigo_barras: payload.codigo_barras,
        descricao: payload.descricao,
        diametro: payload.diametro,
        disciplina: payload.disciplina,
        unidade: payload.unidade,
        peso: payload.peso,
        estoque_minimo: payload.estoque_minimo,
        ativo: payload.ativo,
      } as RemoteMaterialRow);
      merged.saldoAtual = existing.saldoAtual;
      working[idx] = merged;
      byCodigo.set(p.key, merged);
    } else {
      const id = nextId++;
      inserts.push({
        numeroLinha: p.numeroLinha,
        codigo: p.form.codigo,
        row: { id, ...payload },
      });
      const mat = mapRemoteMaterial({
        id,
        codigo: payload.codigo,
        codigo_barras: payload.codigo_barras,
        descricao: payload.descricao,
        diametro: payload.diametro,
        disciplina: payload.disciplina,
        unidade: payload.unidade,
        peso: payload.peso,
        estoque_minimo: payload.estoque_minimo,
        ativo: payload.ativo,
      } as RemoteMaterialRow);
      working.push(mat);
      byCodigo.set(p.key, mat);
    }
  }

  for (let i = 0; i < inserts.length; i += IMPORT_MATERIAIS_CHUNK_INSERT) {
    const chunk = inserts.slice(i, i + IMPORT_MATERIAIS_CHUNK_INSERT);
    const tid = getActiveTenantId();
    const { error } = await supabase.from('materiais').insert(chunk.map((c) => ({ ...c.row, tenant_id: tid })));
    if (error) {
      for (const c of chunk) {
        const { error: e2 } = await supabase.from('materiais').insert({ ...c.row, tenant_id: tid });
        if (e2) {
          detalhes.push(`Linha ${c.numeroLinha} (${c.codigo}): ${e2.message}`);
          ignorados += 1;
        } else {
          criados += 1;
          detalhes.push(`${c.codigo}: incluido.`);
          const prep = prepared.find((x) => x.numeroLinha === c.numeroLinha);
          const depoisMat = prep ? byCodigo.get(prep.key) : undefined;
          if (prep && depoisMat && amostrasAuditoria.length < 8) {
            amostrasAuditoria.push({
              codigo: c.codigo,
              tipo: 'criado',
              antes: prep.antes,
              depois: snapshotMaterialResumo(depoisMat),
            });
          }
        }
      }
    } else {
      criados += chunk.length;
      for (const c of chunk) {
        detalhes.push(`${c.codigo}: incluido.`);
        const prep = prepared.find((x) => x.numeroLinha === c.numeroLinha);
        const depoisMat = prep ? byCodigo.get(prep.key) : undefined;
        if (prep && depoisMat && amostrasAuditoria.length < 8) {
          amostrasAuditoria.push({
            codigo: c.codigo,
            tipo: 'criado',
            antes: prep.antes,
            depois: snapshotMaterialResumo(depoisMat),
          });
        }
      }
    }
    if (cooperativeNuvem) {
      await yieldToMain();
    }
  }

  for (let i = 0; i < updates.length; i += IMPORT_MATERIAIS_PARALLEL_UPDATES) {
    const slice = updates.slice(i, i + IMPORT_MATERIAIS_PARALLEL_UPDATES);
    const outcomes = await Promise.all(
      slice.map((u) =>
        supabase.from('materiais').update(u.payload).eq('id', u.id).eq('tenant_id', getActiveTenantId()),
      ),
    );
    for (let j = 0; j < outcomes.length; j++) {
      const u = slice[j];
      const err = outcomes[j].error;
      if (err) {
        detalhes.push(`Linha ${u.numeroLinha} (${u.codigo}): ${err.message}`);
        ignorados += 1;
      } else {
        atualizados += 1;
        detalhes.push(`${u.codigo}: atualizado.`);
        const prep = prepared.find((x) => x.numeroLinha === u.numeroLinha);
        const depoisMat = prep ? byCodigo.get(prep.key) : undefined;
        if (prep && depoisMat && amostrasAuditoria.length < 8) {
          amostrasAuditoria.push({
            codigo: u.codigo,
            tipo: 'atualizado',
            antes: prep.antes,
            depois: snapshotMaterialResumo(depoisMat),
          });
        }
      }
    }
    if (cooperativeNuvem) {
      await yieldToMain();
    }
  }

  invalidateIsoProSnapshotCache();

  return {
    success: true,
    data: {
      criados,
      atualizados,
      ignorados,
      ignoradosPorDuplicidadeNoArquivo: 0,
      detalhes,
    },
  };
}

export async function importarMateriaisDoArquivoCsv(
  text: string,
  opcoes?: ImportarMateriaisCsvOpcoes,
): Promise<ServiceResult<MateriaisImportacaoResumo>> {
  const { documento, erroEstrutural } = construirDocumentoStagingImportacaoMateriais(text);
  if (erroEstrutural || !documento) {
    return { success: false, error: erroEstrutural ?? 'Falha na camada estrutural do CSV.' };
  }

  const domErr = validarDominiosCadastroImportacaoMateriais(documento);
  if (domErr) {
    return { success: false, error: domErr };
  }

  const base = await loadMateriaisBase();
  const byCodigo = new Map(base.map((m) => [m.codigo.toLowerCase(), m]));
  const codigoImportadoNesteArquivo = new Map<string, number>();
  const detalhesPre: string[] = [];
  let ignoradosPre = 0;
  let ignoradosPorDuplicidadeNoArquivo = 0;
  const prepared: PreparedMateriaisLinha[] = [];

  for (const linha of documento.linhas) {
    if (linha.erros.length > 0) {
      detalhesPre.push(`Linha ${linha.numeroLinha}: ${linha.erros.join(' ')}`);
      ignoradosPre += 1;
      continue;
    }

    const form = linha.formJson;
    const key = form.codigo.toLowerCase();

    if (codigoImportadoNesteArquivo.has(key)) {
      const primeira = codigoImportadoNesteArquivo.get(key)!;
      detalhesPre.push(
        `Linha ${linha.numeroLinha}: codigo "${form.codigo}" repetido no arquivo (ja importado na linha ${primeira}). Linha ignorada.`,
      );
      ignoradosPre += 1;
      ignoradosPorDuplicidadeNoArquivo += 1;
      continue;
    }

    const existing = byCodigo.get(key);
    const antes = existing ? snapshotMaterialResumo(existing) : '(novo)';
    prepared.push({
      numeroLinha: linha.numeroLinha,
      form,
      key,
      existing,
      antes,
    });
    codigoImportadoNesteArquivo.set(key, linha.numeroLinha);
  }

  const amostrasAuditoria: { codigo: string; tipo: 'criado' | 'atualizado'; antes: string; depois: string }[] = [];

  const inner = shouldUseCloudMaterials()
    ? await importarMateriaisCsvNuvemEmLotes(prepared, amostrasAuditoria)
    : await importarMateriaisCsvLocalEmLote(prepared, amostrasAuditoria);

  if (!inner.success || !inner.data) {
    return inner;
  }

  const resumo: MateriaisImportacaoResumo = {
    criados: inner.data.criados,
    atualizados: inner.data.atualizados,
    ignorados: inner.data.ignorados + ignoradosPre,
    ignoradosPorDuplicidadeNoArquivo,
    detalhes: [...detalhesPre, ...inner.data.detalhes],
  };

  if (resumo.criados === 0 && resumo.atualizados === 0) {
    return {
      success: false,
      error: 'Nenhuma alteracao aplicada. Revise o arquivo e os avisos acima.',
      data: resumo,
    };
  }

  appendAuthAuditEvent({
    type: 'materiais_csv_imported',
    actorLogin: opcoes?.actorLogin ?? 'desconhecido',
    detail: montarDetalheAuditoriaImportMateriais(
      resumo.criados,
      resumo.atualizados,
      resumo.ignorados,
      amostrasAuditoria,
    ),
  });

  return { success: true, data: resumo };
}
