/**
 * Fatia operacional de Configurações partilhada EXE ↔ Web via `iso_pro_snapshot.configuracoesSistema`.
 * Exclui blindagem desktop e backup Oracle (só PC).
 */
import type { ConfiguracaoSistema, RirProcedimentoCadastroItem } from '../types/configuracao.types';
import { normalizeTemaSistemaId } from '../../../lib/temaSistema';

const RIR_MODOS = ['auto', 'disciplina', 'manual'] as const;

export type ConfigOperacionalSnapshot = {
  configOperacionalAtualizadoEm?: string;
  cliente?: string;
  projeto?: string;
  contrato?: string;
  local?: string;
  tema?: ConfiguracaoSistema['tema'];
  mostrarAjudaModulos?: boolean;
  rirModoNumeracao?: ConfiguracaoSistema['rirModoNumeracao'];
  rirProcedimentosCadastro?: RirProcedimentoCadastroItem[];
  rirPrefSenha?: string;
  rncPrefSenha?: string;
  materiaisNuvem?: boolean;
  logoInstitucionalUrl?: string;
  documentoRodapeNome?: string;
  documentoRodapeCnpj?: string;
  relatorioFinalIaHabilitado?: boolean;
  relatorioFinalIaApiKey?: string;
  relatorioFinalIaModelo?: string;
  relatorioFinalIaBaseUrl?: string;
  pdfNuvemHabilitado?: boolean;
  pdfNuvemTimeoutSegundos?: number;
  /** Listas de domínio de materiais (antes só localStorage). */
  materiaisDominios?: {
    disciplinas: string[];
    unidades: string[];
    unidadeDescricoes: Record<string, string>;
  };
};

function normalizeRirModo(m: unknown): ConfiguracaoSistema['rirModoNumeracao'] {
  return RIR_MODOS.includes(m as (typeof RIR_MODOS)[number])
    ? (m as ConfiguracaoSistema['rirModoNumeracao'])
    : 'auto';
}

function normalizeProcedimentos(raw: unknown): RirProcedimentoCadastroItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p) => p && typeof p === 'object')
    .map((p) => {
      const o = p as Record<string, unknown>;
      return {
        id: String(o.id ?? '').trim(),
        base: String(o.base ?? '').trim(),
        revisao: String(o.revisao ?? '').trim(),
        atualizadoEm: String(o.atualizadoEm ?? '').trim(),
      };
    })
    .filter((p) => p.id && p.base);
}

export function extrairConfigOperacionalParaSnapshot(
  config: ConfiguracaoSistema,
  opts?: { materiaisDominios?: ConfigOperacionalSnapshot['materiaisDominios']; atualizadoEm?: string },
): ConfigOperacionalSnapshot {
  return {
    configOperacionalAtualizadoEm: opts?.atualizadoEm ?? new Date().toISOString(),
    cliente: config.cliente.trim(),
    projeto: config.projeto.trim(),
    contrato: config.contrato.trim(),
    local: config.local.trim(),
    tema: config.tema,
    mostrarAjudaModulos: config.mostrarAjudaModulos !== false,
    rirModoNumeracao: config.rirModoNumeracao,
    rirProcedimentosCadastro: (config.rirProcedimentosCadastro ?? []).map((p) => ({
      id: p.id.trim(),
      base: p.base.trim(),
      revisao: p.revisao.trim(),
      atualizadoEm: p.atualizadoEm.trim(),
    })),
    rirPrefSenha: config.rirPrefSenha.trim(),
    rncPrefSenha: config.rncPrefSenha.trim(),
    materiaisNuvem: config.materiaisNuvem === true,
    logoInstitucionalUrl: config.logoInstitucionalUrl.trim(),
    documentoRodapeNome: config.documentoRodapeNome.trim(),
    documentoRodapeCnpj: config.documentoRodapeCnpj.trim(),
    relatorioFinalIaHabilitado: config.relatorioFinalIaHabilitado === true,
    relatorioFinalIaApiKey: config.relatorioFinalIaApiKey.trim(),
    relatorioFinalIaModelo: config.relatorioFinalIaModelo.trim(),
    relatorioFinalIaBaseUrl: config.relatorioFinalIaBaseUrl.trim(),
    pdfNuvemHabilitado: config.pdfNuvemHabilitado !== false,
    pdfNuvemTimeoutSegundos: config.pdfNuvemTimeoutSegundos,
    ...(opts?.materiaisDominios ? { materiaisDominios: opts.materiaisDominios } : {}),
  };
}

export function lerConfigOperacionalDoSnapshot(raw: unknown): ConfigOperacionalSnapshot {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const temaRaw = o.tema;
  const tema =
    temaRaw === undefined || temaRaw === null || temaRaw === ''
      ? undefined
      : normalizeTemaSistemaId(temaRaw, 'campo');

  let materiaisDominios: ConfigOperacionalSnapshot['materiaisDominios'];
  const md = o.materiaisDominios;
  if (md && typeof md === 'object' && !Array.isArray(md)) {
    const m = md as Record<string, unknown>;
    materiaisDominios = {
      disciplinas: Array.isArray(m.disciplinas) ? m.disciplinas.map(String) : [],
      unidades: Array.isArray(m.unidades) ? m.unidades.map(String) : [],
      unidadeDescricoes:
        m.unidadeDescricoes && typeof m.unidadeDescricoes === 'object' && !Array.isArray(m.unidadeDescricoes)
          ? Object.fromEntries(
              Object.entries(m.unidadeDescricoes as Record<string, unknown>).map(([k, v]) => [
                String(k),
                String(v ?? ''),
              ]),
            )
          : {},
    };
  }

  return {
    configOperacionalAtualizadoEm: String(o.configOperacionalAtualizadoEm ?? '').trim() || undefined,
    cliente: String(o.cliente ?? '').trim(),
    projeto: String(o.projeto ?? '').trim(),
    contrato: String(o.contrato ?? '').trim(),
    local: String(o.local ?? '').trim(),
    tema,
    mostrarAjudaModulos: o.mostrarAjudaModulos === undefined ? undefined : o.mostrarAjudaModulos !== false,
    rirModoNumeracao: o.rirModoNumeracao === undefined ? undefined : normalizeRirModo(o.rirModoNumeracao),
    rirProcedimentosCadastro: Array.isArray(o.rirProcedimentosCadastro)
      ? normalizeProcedimentos(o.rirProcedimentosCadastro)
      : undefined,
    rirPrefSenha: o.rirPrefSenha === undefined ? undefined : String(o.rirPrefSenha ?? '').trim(),
    rncPrefSenha: o.rncPrefSenha === undefined ? undefined : String(o.rncPrefSenha ?? '').trim(),
    materiaisNuvem: o.materiaisNuvem === undefined ? undefined : o.materiaisNuvem === true,
    logoInstitucionalUrl:
      o.logoInstitucionalUrl === undefined ? undefined : String(o.logoInstitucionalUrl ?? '').trim(),
    documentoRodapeNome:
      o.documentoRodapeNome === undefined ? undefined : String(o.documentoRodapeNome ?? '').trim(),
    documentoRodapeCnpj:
      o.documentoRodapeCnpj === undefined ? undefined : String(o.documentoRodapeCnpj ?? '').trim(),
    relatorioFinalIaHabilitado:
      o.relatorioFinalIaHabilitado === undefined ? undefined : o.relatorioFinalIaHabilitado === true,
    relatorioFinalIaApiKey:
      o.relatorioFinalIaApiKey === undefined ? undefined : String(o.relatorioFinalIaApiKey ?? '').trim(),
    relatorioFinalIaModelo:
      o.relatorioFinalIaModelo === undefined ? undefined : String(o.relatorioFinalIaModelo ?? '').trim(),
    relatorioFinalIaBaseUrl:
      o.relatorioFinalIaBaseUrl === undefined ? undefined : String(o.relatorioFinalIaBaseUrl ?? '').trim(),
    pdfNuvemHabilitado: o.pdfNuvemHabilitado === undefined ? undefined : o.pdfNuvemHabilitado !== false,
    pdfNuvemTimeoutSegundos:
      o.pdfNuvemTimeoutSegundos === undefined
        ? undefined
        : Number.isFinite(Number(o.pdfNuvemTimeoutSegundos))
          ? Number(o.pdfNuvemTimeoutSegundos)
          : undefined,
    materiaisDominios,
  };
}

const LOCAL_TS_KEY_BASE = 'iso-pro-desktop-config-operacional-ts';

export function configOperacionalTsStorageKey(scopedKey: string): string {
  return `${scopedKey}::operacional-ts`;
}

export function readLocalConfigOperacionalTs(storageKey: string): string {
  if (typeof localStorage === 'undefined') return '';
  try {
    return localStorage.getItem(configOperacionalTsStorageKey(storageKey))?.trim() ?? '';
  } catch {
    return '';
  }
}

export function writeLocalConfigOperacionalTs(storageKey: string, iso: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(configOperacionalTsStorageKey(storageKey), iso);
}

/** true se a nuvem deve sobrescrever o local (LWW por timestamp). */
export function nuvemConfigOperacionalMaisRecente(localTs: string, nuvemTs: string | undefined): boolean {
  if (!nuvemTs) return false;
  if (!localTs) return true;
  const a = Date.parse(localTs);
  const b = Date.parse(nuvemTs);
  if (!Number.isFinite(b)) return false;
  if (!Number.isFinite(a)) return true;
  return b > a;
}

/**
 * Aplica fatia operacional da nuvem sobre a config local (campos definidos no snapshot).
 * Não toca blindagem desktop / credenciais Supabase do formulário / backup Oracle.
 */
export function aplicarConfigOperacionalDoSnapshot(
  local: ConfiguracaoSistema,
  snap: ConfigOperacionalSnapshot,
): ConfiguracaoSistema {
  const next: ConfiguracaoSistema = { ...local };
  if (snap.cliente !== undefined) next.cliente = snap.cliente;
  if (snap.projeto !== undefined) next.projeto = snap.projeto;
  if (snap.contrato !== undefined) next.contrato = snap.contrato;
  if (snap.local !== undefined) next.local = snap.local;
  if (snap.tema !== undefined) next.tema = snap.tema;
  if (snap.mostrarAjudaModulos !== undefined) next.mostrarAjudaModulos = snap.mostrarAjudaModulos;
  if (snap.rirModoNumeracao !== undefined) next.rirModoNumeracao = snap.rirModoNumeracao;
  // Nunca substituir catálogo local não-vazio por [] da nuvem (hydrate LWW agressivo).
  if (snap.rirProcedimentosCadastro !== undefined) {
    const nuvemTem = snap.rirProcedimentosCadastro.length > 0;
    const localTem = (local.rirProcedimentosCadastro?.length ?? 0) > 0;
    if (nuvemTem || !localTem) {
      next.rirProcedimentosCadastro = snap.rirProcedimentosCadastro;
    }
  }
  if (snap.rirPrefSenha !== undefined) next.rirPrefSenha = snap.rirPrefSenha;
  if (snap.rncPrefSenha !== undefined) next.rncPrefSenha = snap.rncPrefSenha;
  if (snap.materiaisNuvem !== undefined) next.materiaisNuvem = snap.materiaisNuvem;
  if (snap.logoInstitucionalUrl !== undefined) next.logoInstitucionalUrl = snap.logoInstitucionalUrl;
  if (snap.documentoRodapeNome !== undefined) next.documentoRodapeNome = snap.documentoRodapeNome;
  if (snap.documentoRodapeCnpj !== undefined) next.documentoRodapeCnpj = snap.documentoRodapeCnpj;
  if (snap.relatorioFinalIaHabilitado !== undefined) {
    next.relatorioFinalIaHabilitado = snap.relatorioFinalIaHabilitado;
  }
  if (snap.relatorioFinalIaApiKey !== undefined) next.relatorioFinalIaApiKey = snap.relatorioFinalIaApiKey;
  if (snap.relatorioFinalIaModelo !== undefined) next.relatorioFinalIaModelo = snap.relatorioFinalIaModelo;
  if (snap.relatorioFinalIaBaseUrl !== undefined) next.relatorioFinalIaBaseUrl = snap.relatorioFinalIaBaseUrl;
  if (snap.pdfNuvemHabilitado !== undefined) next.pdfNuvemHabilitado = snap.pdfNuvemHabilitado;
  if (snap.pdfNuvemTimeoutSegundos !== undefined) next.pdfNuvemTimeoutSegundos = snap.pdfNuvemTimeoutSegundos;
  // Segredos Edge (admin/link) nunca vêm do snapshot — ficam no cofre/sessão local.
  return next;
}

/** Heurística: local sem obra/procedimentos → aceitar nuvem mesmo sem timestamp antigo. */
export function localConfigOperacionalVazioParaHydrate(config: ConfiguracaoSistema): boolean {
  const semObra = ![config.cliente, config.projeto, config.contrato, config.local].some((v) => v.trim());
  const semProc = !(config.rirProcedimentosCadastro?.length > 0);
  return semObra && semProc;
}

/** Ex.: "PE-TUB-003 REV.2" → { base, revisao }. */
export function parseProcedimentoTextoParaCadastro(texto: string): { base: string; revisao: string } | null {
  const t = String(texto ?? '').trim();
  if (!t) return null;
  const m = t.match(/^(.*?)\s+(REV\.?\s*\S+)$/i);
  if (m) {
    const base = m[1].trim();
    const revisao = m[2].trim().replace(/\s+/g, '');
    if (base) return { base, revisao };
  }
  return { base: t, revisao: '—' };
}

/** Reconstrói catálogo de sugestões a partir dos Nº Procedimento já gravados nos RIR. */
export function reconstruirProcedimentosCadastroDeTextos(
  textos: string[],
  agoraIso = new Date().toISOString(),
): RirProcedimentoCadastroItem[] {
  const byKey = new Map<string, RirProcedimentoCadastroItem>();
  const dia = agoraIso.slice(0, 10);
  for (const raw of textos) {
    const parsed = parseProcedimentoTextoParaCadastro(raw);
    if (!parsed) continue;
    const key = `${parsed.base.toUpperCase()}|${parsed.revisao.toUpperCase()}`;
    if (byKey.has(key)) continue;
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `proc-${byKey.size + 1}-${dia}`;
    byKey.set(key, {
      id,
      base: parsed.base,
      revisao: parsed.revisao,
      atualizadoEm: dia,
    });
  }
  return [...byKey.values()];
}

export { LOCAL_TS_KEY_BASE };
