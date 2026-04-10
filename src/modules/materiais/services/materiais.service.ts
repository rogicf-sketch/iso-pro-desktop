import { escapeCsvCellSemicolon } from '../../../lib/csv';
import { invalidateIsoProSnapshotCache, readIsoProSnapshotPayload } from '../../../lib/isoProSnapshot';
import { getSupabase, hasSupabaseConfig, shouldUseCloudMaterials } from '../../../lib/supabase';
import { buildSaldoMap, codigoMaterialKey, type SaldoSnapshotPayload } from '../../estoque/saldoFromSnapshot';
import type { PaginatedResult, ServiceResult } from '../../../types/common.types';
import { getCurrentUser } from '../../auth/services/auth.service';
import { appendAuthAuditEvent } from '../../auth/services/authAudit.service';
import type { RecebimentoItem } from '../../recebimentos/types/recebimento.types';
import type { Material, MaterialFiltro, MaterialFormData, MaterialListItem } from '../types/material.types';
import { validateMaterial } from '../schemas/material.schema';
import { backfillCodigosBarrasMateriais } from '../utils/backfillCodigosBarrasMateriais';
import { gerarProximoCodigoBarrasEan13 } from '../utils/gerarCodigoBarrasEan13';
import { construirDocumentoStagingImportacaoMateriais } from './materiais.import.pipeline';
import { readMateriaisDominiosListas, writeMateriaisDominiosListas } from './materiaisDominios.storage';

export { materialRegistroCsvParaFormData, serializarDocumentoStagingMateriais, validarImportacaoMaterialEmCamadas } from './materiais.import.pipeline';
export type { MaterialImportStagingDocument, MaterialImportStagingLinha } from './materiais.import.pipeline';

const STORAGE_KEY = 'iso-pro-desktop-materiais';

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
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    let initial = seedData.map(normalizarMaterialLeitura);
    const bf = backfillCodigosBarrasMateriais(initial);
    if (bf.alterou) {
      initial = bf.next;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }

  try {
    const parsed = JSON.parse(raw) as Material[];
    const withNorm = parsed.map(normalizarMaterialLeitura);
    const { next, alterou } = backfillCodigosBarrasMateriais(withNorm);
    if (alterou) {
      writeAll(next);
    }
    return next;
  } catch {
    let initial = seedData.map(normalizarMaterialLeitura);
    const bf = backfillCodigosBarrasMateriais(initial);
    if (bf.alterou) {
      initial = bf.next;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }
}

function writeAll(items: Material[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
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

  const { data, error } = await supabase
    .from('materiais')
    .select('id,codigo,codigo_barras,descricao,diametro,disciplina,unidade,peso,estoque_minimo,ativo')
    .order('codigo', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const items = (data ?? []).map((row) => mapRemoteMaterial(row as RemoteMaterialRow));
  const { next, alterou } = backfillCodigosBarrasMateriais(items);
  if (!alterou) {
    return next;
  }

  const porId = new Map(items.map((m) => [m.id, m]));
  for (const m of next) {
    const antigo = porId.get(m.id);
    if (antigo && antigo.codigoBarras !== m.codigoBarras) {
      const { error: upErr } = await supabase
        .from('materiais')
        .update({ codigo_barras: m.codigoBarras })
        .eq('id', Number(m.id));
      if (upErr) {
        throw new Error(upErr.message);
      }
    }
  }

  return next;
}

async function getNextMaterialId() {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase nao configurado.');
  }

  const { data, error } = await supabase.from('materiais').select('id').order('id', { ascending: false }).limit(1);

  if (error) {
    throw new Error(error.message);
  }

  return Number(data?.[0]?.id ?? 0) + 1;
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
          .select('id,codigo,codigo_barras,descricao,diametro,disciplina,unidade,peso,estoque_minimo,ativo')
          .single();

        if (error) return { success: false, error: error.message };
        return { success: true, data: mapRemoteMaterial(data as RemoteMaterialRow) };
      }

      const nextId = await getNextMaterialId();
      const { data, error } = await supabase
        .from('materiais')
        .insert({ id: nextId, ...normalizedPayload })
        .select('id,codigo,codigo_barras,descricao,diametro,disciplina,unidade,peso,estoque_minimo,ativo')
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, data: mapRemoteMaterial(data as RemoteMaterialRow) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Falha ao salvar no Supabase.' };
    }
  }

  const items = readAll();
  const duplicated = items.find(
    (item) => item.codigo.toLowerCase() === payload.codigo.trim().toLowerCase() && item.id !== currentId,
  );

  if (duplicated) {
    return { success: false, error: 'Ja existe um material com esse codigo.' };
  }

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
  writeAll(items);

  return { success: true, data: created };
}

/**
 * Para cada linha de recebimento cujo codigo ainda nao existe no cadastro, cria o material
 * (disciplina/unidade/peso vindos da linha; descricao obrigatoria).
 * Chamado apos gravar recebimento para alinhar cadastro ao que ja entrou por NF/importacao.
 */
export async function garantirCadastroMateriaisParaItensRecebimento(itens: RecebimentoItem[]): Promise<void> {
  if (!itens.length) return;
  const base = await loadMateriaisBase();
  const existentes = new Set(base.map((m) => m.codigo.trim().toLowerCase()).filter(Boolean));

  for (const it of itens) {
    const cod = it.codigoMaterial.trim();
    if (!cod) continue;
    const key = cod.toLowerCase();
    if (existentes.has(key)) continue;

    const form: MaterialFormData = {
      codigo: cod,
      codigoBarras: '',
      descricao: it.descricaoMaterial.trim() || cod,
      diametro: '',
      disciplina: it.disciplina.trim() || 'Geral',
      unidade: it.unidade.trim() || 'UN',
      peso: Number.isFinite(it.pesoUnitario) && (it.pesoUnitario ?? 0) >= 0 ? Number(it.pesoUnitario) : 0,
      estoqueMinimo: 0,
      ativo: true,
      observacao: 'Incluido automaticamente a partir de recebimento.',
    };

    const validacao = validateMaterial(form);
    if (validacao) {
      continue;
    }

    const res = await salvarMaterial(form);
    if (res.success) {
      existentes.add(key);
    }
  }
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

  items[index] = { ...items[index], ativo };
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

      const { error } = await supabase.from('materiais').delete().in('id', numericIds);
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
  const cur = readMateriaisDominiosListas();
  writeMateriaisDominiosListas({ ...cur, disciplinas });
}

export function salvarDominiosUnidadesMateriais(unidades: string[]): void {
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
        String(m.peso),
        String(m.estoqueMinimo),
        String(m.saldoAtual),
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
  return { ok: true, linhaCount: documento.linhas.length };
}

export async function importarMateriaisDoArquivoCsv(
  text: string,
  opcoes?: ImportarMateriaisCsvOpcoes,
): Promise<ServiceResult<MateriaisImportacaoResumo>> {
  const { documento, erroEstrutural } = construirDocumentoStagingImportacaoMateriais(text);
  if (erroEstrutural || !documento) {
    return { success: false, error: erroEstrutural ?? 'Falha na camada estrutural do CSV.' };
  }

  const detalhes: string[] = [];
  let criados = 0;
  let atualizados = 0;
  let ignorados = 0;
  let ignoradosPorDuplicidadeNoArquivo = 0;
  const amostrasAuditoria: { codigo: string; tipo: 'criado' | 'atualizado'; antes: string; depois: string }[] = [];

  const base = await loadMateriaisBase();
  const byCodigo = new Map(base.map((m) => [m.codigo.toLowerCase(), m]));
  /** Primeira linha do arquivo em que cada codigo foi importado com sucesso (evita segunda linha igual no mesmo CSV). */
  const codigoImportadoNesteArquivo = new Map<string, number>();

  for (const linha of documento.linhas) {
    if (linha.erros.length > 0) {
      detalhes.push(`Linha ${linha.numeroLinha}: ${linha.erros.join(' ')}`);
      ignorados += 1;
      continue;
    }

    const form = linha.formJson;
    const key = form.codigo.toLowerCase();

    if (codigoImportadoNesteArquivo.has(key)) {
      const primeira = codigoImportadoNesteArquivo.get(key)!;
      detalhes.push(
        `Linha ${linha.numeroLinha}: codigo "${form.codigo}" repetido no arquivo (ja importado na linha ${primeira}). Linha ignorada.`,
      );
      ignorados += 1;
      ignoradosPorDuplicidadeNoArquivo += 1;
      continue;
    }
    const existing = byCodigo.get(key);
    const antes = existing ? snapshotMaterialResumo(existing) : '(novo)';

    const result = await salvarMaterial(form, existing?.id);
    if (!result.success || !result.data) {
      detalhes.push(`Linha ${linha.numeroLinha} (${form.codigo}): ${result.error ?? 'falha ao salvar.'}`);
      ignorados += 1;
      continue;
    }

    const saved = result.data;
    const depois = snapshotMaterialResumo(saved);

    if (existing) {
      atualizados += 1;
      byCodigo.set(key, saved);
      codigoImportadoNesteArquivo.set(key, linha.numeroLinha);
      detalhes.push(`${form.codigo}: atualizado.`);
      if (amostrasAuditoria.length < 8) {
        amostrasAuditoria.push({ codigo: form.codigo, tipo: 'atualizado', antes, depois });
      }
    } else {
      criados += 1;
      byCodigo.set(key, saved);
      codigoImportadoNesteArquivo.set(key, linha.numeroLinha);
      detalhes.push(`${form.codigo}: incluido.`);
      if (amostrasAuditoria.length < 8) {
        amostrasAuditoria.push({ codigo: form.codigo, tipo: 'criado', antes, depois });
      }
    }
  }

  const resumo: MateriaisImportacaoResumo = {
    criados,
    atualizados,
    ignorados,
    ignoradosPorDuplicidadeNoArquivo,
    detalhes,
  };

  if (criados === 0 && atualizados === 0) {
    return {
      success: false,
      error: 'Nenhuma alteracao aplicada. Revise o arquivo e os avisos acima.',
      data: resumo,
    };
  }

  appendAuthAuditEvent({
    type: 'materiais_csv_imported',
    actorLogin: opcoes?.actorLogin ?? 'desconhecido',
    detail: montarDetalheAuditoriaImportMateriais(criados, atualizados, ignorados, amostrasAuditoria),
  });

  return { success: true, data: resumo };
}
