import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';
import { avisarPreservacaoLocalStorageCorrupto } from '../../../lib/localStoragePreservacao';
import { dispatchIsoProConfigUpdatedEvent } from '../../../lib/configEvents';
import { getCurrentUser } from '../../auth/services/auth.service';
import { LOGO_INSTITUCIONAL_PADRAO_FABRICA } from '../../../lib/logoInstitucional.constants';
import { invalidateIsoProSnapshotCache } from '../../../lib/isoProSnapshot';
import { getSupabaseConfigDiagnostics, hasSupabaseConfig, resetSupabaseClient } from '../../../lib/supabase';
import type { ServiceResult } from '../../../types/common.types';
import { parseConfiguracaoJson } from '../schemas/configuracaoPersistido.zod';
import type { ConfiguracaoSistema, RirProcedimentoCadastroItem } from '../types/configuracao.types';
import { normalizeIaApiBaseUrl } from '../../../lib/isoProIaApi.service';
import { syncOciUploadContextFromConfig } from './ociUploadContextSync.service';
import { sincronizarConfigAlertaEstoqueParaNuvem } from './syncAlertaEstoqueConfigNuvem.service';

const STORAGE_KEY_BASE = 'iso-pro-desktop-configuracoes-sistema';

function configStorageKey(): string {
  return getScopedIsoProStorageKey(STORAGE_KEY_BASE);
}

const TEMAS_VALIDOS: ConfiguracaoSistema['tema'][] = ['padrao', 'escuro', 'claro', 'verde', 'neon'];
const RIR_MODOS_VALIDOS: ConfiguracaoSistema['rirModoNumeracao'][] = ['auto', 'disciplina', 'manual'];

function normalizeRirModoNumeracao(m: unknown): ConfiguracaoSistema['rirModoNumeracao'] {
  return RIR_MODOS_VALIDOS.includes(m as ConfiguracaoSistema['rirModoNumeracao'])
    ? (m as ConfiguracaoSistema['rirModoNumeracao'])
    : 'auto';
}

function normalizeTema(t: unknown): ConfiguracaoSistema['tema'] {
  if (t === undefined || t === null || t === '') {
    return defaultConfig.tema;
  }
  return TEMAS_VALIDOS.includes(t as ConfiguracaoSistema['tema']) ? (t as ConfiguracaoSistema['tema']) : 'padrao';
}

/** Alinha site/embebido em producao: primeiro perfil ja usa tabela `materiais` na nuvem quando URL/chave vêm do build. */
function materiaisNuvemPadraoParaPrimeiroPerfil(): boolean {
  const v = import.meta.env.VITE_SUPABASE_PREFER_SAVED_CONFIG;
  const s = v == null ? '' : String(v).trim().toLowerCase();
  const preferSaved = s === 'true' || s === '1' || s === 'yes';
  const envUrl = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim();
  const envKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  if (!envUrl || !envKey || preferSaved) return false;
  return import.meta.env.PROD;
}

const defaultConfig: ConfiguracaoSistema = {
  cliente: '',
  projeto: '',
  contrato: '',
  local: '',
  tema: 'neon',
  mostrarAjudaModulos: true,
  sequenciaAtendimento: 0,
  rirModoNumeracao: 'auto',
  rirProcedimentosCadastro: [] as RirProcedimentoCadastroItem[],
  rirPrefSenha: '',
  rncPrefSenha: '',
  materiaisNuvem: materiaisNuvemPadraoParaPrimeiroPerfil(),
  supabaseUrl: '',
  supabaseAnonKey: '',
  isoProLinkAuthSecret: '',
  isoProAdminUserSecret: '',
  desktopVinculoAtivo: false,
  desktopInstalacaoAutorizadaId: '',
  desktopInstalacaoAutorizadaNome: '',
  desktopUltimaValidacaoEm: '',
  desktopLicencaToken: '',
  desktopLicencaEmitidaPara: '',
  desktopLicencaExpiraEm: '',
  logoInstitucionalUrl: LOGO_INSTITUCIONAL_PADRAO_FABRICA,
  documentoRodapeNome: 'I.S.O PRO Gestão de Materiais',
  documentoRodapeCnpj: '66.234.531/0001-57',
  relatorioFinalIaHabilitado: false,
  relatorioFinalIaApiKey: '',
  relatorioFinalIaModelo: 'gpt-4o-mini',
  relatorioFinalIaBaseUrl: 'https://api.openai.com/v1',
  alertaEstoqueEmailHabilitado: false,
  alertaEstoqueEmailDestinatarios: '',
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  smtpUsuario: '',
  smtpSenha: '',
  smtpRemetente: '',
};

function normalizeRelatorioFinalIaBaseUrl(url: unknown): string {
  return normalizeIaApiBaseUrl(url);
}

export function aplicarTemaSistema(tema: ConfiguracaoSistema['tema']) {
  if (typeof document === 'undefined') return;
  document.body.classList.remove('theme-padrao', 'theme-escuro', 'theme-claro', 'theme-verde', 'theme-neon');
  document.body.classList.add(`theme-${tema}`);
}

function normalizeLoginParaChaveArmazenamento(login: string): string {
  const t = login
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  const s = t.replace(/[^a-z0-9._-]/g, '_');
  return s || 'anon';
}

function chaveLocalStorageTemaPreferidoUsuario(login: string): string {
  return getScopedIsoProStorageKey(`iso-pro-desktop-usuario-tema-${normalizeLoginParaChaveArmazenamento(login)}`);
}

/** Tema escolhido só para este login neste ambiente (localStorage); `null` = seguir o tema da instalação. */
export function readUsuarioTemaPreferido(): ConfiguracaoSistema['tema'] | null {
  if (typeof localStorage === 'undefined') return null;
  const u = getCurrentUser();
  if (!u?.login?.trim()) return null;
  const raw = localStorage.getItem(chaveLocalStorageTemaPreferidoUsuario(u.login))?.trim();
  if (!raw) return null;
  return TEMAS_VALIDOS.includes(raw as ConfiguracaoSistema['tema']) ? (raw as ConfiguracaoSistema['tema']) : null;
}

export function salvarUsuarioTemaPreferido(tema: ConfiguracaoSistema['tema']): void {
  if (typeof localStorage === 'undefined') return;
  const u = getCurrentUser();
  if (!u?.login?.trim()) return;
  localStorage.setItem(chaveLocalStorageTemaPreferidoUsuario(u.login), normalizeTema(tema));
}

export function limparUsuarioTemaPreferido(): void {
  if (typeof localStorage === 'undefined') return;
  const u = getCurrentUser();
  if (!u?.login?.trim()) return;
  localStorage.removeItem(chaveLocalStorageTemaPreferidoUsuario(u.login));
}

export function readConfiguracoes(): ConfiguracaoSistema {
  const raw = localStorage.getItem(configStorageKey());
  if (!raw) {
    localStorage.setItem(configStorageKey(), JSON.stringify(defaultConfig));
    return defaultConfig;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const validated = parseConfiguracaoJson(parsed);
    if (!validated) {
      avisarPreservacaoLocalStorageCorrupto('Configuracoes', configStorageKey());
      return { ...defaultConfig };
    }
    const parsedConfig = validated as Partial<ConfiguracaoSistema> & { reciboLogoUrl?: string };
    const logoBruto = (parsedConfig.logoInstitucionalUrl ?? parsedConfig.reciboLogoUrl ?? '').trim();
    const logoInstitucionalUrl = logoBruto || LOGO_INSTITUCIONAL_PADRAO_FABRICA;
    const rirProcedimentosCadastro = Array.isArray(parsedConfig.rirProcedimentosCadastro)
      ? (parsedConfig.rirProcedimentosCadastro as RirProcedimentoCadastroItem[])
      : defaultConfig.rirProcedimentosCadastro;
    return {
      ...defaultConfig,
      ...parsedConfig,
      tema: normalizeTema(parsedConfig.tema),
      mostrarAjudaModulos: parsedConfig.mostrarAjudaModulos !== false,
      rirModoNumeracao: normalizeRirModoNumeracao(parsedConfig.rirModoNumeracao),
      logoInstitucionalUrl,
      rirProcedimentosCadastro,
      relatorioFinalIaHabilitado: parsedConfig.relatorioFinalIaHabilitado === true,
      relatorioFinalIaApiKey: String(parsedConfig.relatorioFinalIaApiKey ?? '').trim(),
      relatorioFinalIaModelo: String(parsedConfig.relatorioFinalIaModelo ?? '').trim() || defaultConfig.relatorioFinalIaModelo,
      relatorioFinalIaBaseUrl: normalizeRelatorioFinalIaBaseUrl(parsedConfig.relatorioFinalIaBaseUrl),
      alertaEstoqueEmailHabilitado: parsedConfig.alertaEstoqueEmailHabilitado === true,
      alertaEstoqueEmailDestinatarios: String(parsedConfig.alertaEstoqueEmailDestinatarios ?? '').trim(),
      smtpHost: String(parsedConfig.smtpHost ?? '').trim(),
      smtpPort: Number.isFinite(Number(parsedConfig.smtpPort)) && Number(parsedConfig.smtpPort) > 0
        ? Number(parsedConfig.smtpPort)
        : defaultConfig.smtpPort,
      smtpSecure: parsedConfig.smtpSecure === true,
      smtpUsuario: String(parsedConfig.smtpUsuario ?? '').trim(),
      smtpSenha: String(parsedConfig.smtpSenha ?? ''),
      smtpRemetente: String(parsedConfig.smtpRemetente ?? '').trim(),
    };
  } catch {
    avisarPreservacaoLocalStorageCorrupto('Configuracoes', configStorageKey());
    return { ...defaultConfig };
  }
}

/** Tema visível na sessão: preferência pessoal (se existir) ou tema gravado na configuração da instalação. */
export function readTemaEfetivoParaSessao(): ConfiguracaoSistema['tema'] {
  return readUsuarioTemaPreferido() ?? readConfiguracoes().tema;
}

export function aplicarTemaEfetivoNaSessao(): void {
  aplicarTemaSistema(readTemaEfetivoParaSessao());
}

export async function carregarConfiguracoes(): Promise<ConfiguracaoSistema> {
  const config = readConfiguracoes();
  aplicarTemaEfetivoNaSessao();
  return config;
}

export async function salvarConfiguracoes(payload: ConfiguracaoSistema): Promise<ServiceResult<ConfiguracaoSistema>> {
  const previous = readConfiguracoes();

  let credenciaisSupabaseParaPersistir = {
    url: payload.supabaseUrl.trim(),
    key: payload.supabaseAnonKey.trim(),
  };
  if (typeof window !== 'undefined') {
    const d = getSupabaseConfigDiagnostics();
    if (d.urlFrom === 'vite-env' && d.keyFrom === 'vite-env') {
      credenciaisSupabaseParaPersistir = { url: '', key: '' };
    }
  }

  const normalizedBase: ConfiguracaoSistema = {
    ...payload,
    tema: normalizeTema(payload.tema),
    mostrarAjudaModulos: payload.mostrarAjudaModulos !== false,
    rirModoNumeracao: normalizeRirModoNumeracao(payload.rirModoNumeracao),
    cliente: payload.cliente.trim(),
    projeto: payload.projeto.trim(),
    contrato: payload.contrato.trim(),
    local: payload.local.trim(),
    rirProcedimentosCadastro: (payload.rirProcedimentosCadastro ?? []).map((p) => ({
      id: p.id.trim(),
      base: p.base.trim(),
      revisao: p.revisao.trim(),
      atualizadoEm: p.atualizadoEm.trim(),
    })),
    rirPrefSenha: payload.rirPrefSenha.trim(),
    rncPrefSenha: payload.rncPrefSenha.trim(),
    supabaseUrl: credenciaisSupabaseParaPersistir.url,
    supabaseAnonKey: credenciaisSupabaseParaPersistir.key,
    isoProLinkAuthSecret: payload.isoProLinkAuthSecret.trim(),
    isoProAdminUserSecret: payload.isoProAdminUserSecret.trim(),
    desktopLicencaToken: payload.desktopLicencaToken.trim(),
    desktopLicencaEmitidaPara: payload.desktopLicencaEmitidaPara.trim(),
    desktopLicencaExpiraEm: payload.desktopLicencaExpiraEm.trim(),
    logoInstitucionalUrl: payload.logoInstitucionalUrl.trim() || LOGO_INSTITUCIONAL_PADRAO_FABRICA,
    documentoRodapeNome: payload.documentoRodapeNome.trim(),
    documentoRodapeCnpj: payload.documentoRodapeCnpj.trim(),
    relatorioFinalIaHabilitado: payload.relatorioFinalIaHabilitado === true,
    relatorioFinalIaApiKey: payload.relatorioFinalIaApiKey.trim(),
    relatorioFinalIaModelo: payload.relatorioFinalIaModelo.trim() || defaultConfig.relatorioFinalIaModelo,
    relatorioFinalIaBaseUrl: normalizeRelatorioFinalIaBaseUrl(payload.relatorioFinalIaBaseUrl),
    alertaEstoqueEmailHabilitado: payload.alertaEstoqueEmailHabilitado === true,
    alertaEstoqueEmailDestinatarios: payload.alertaEstoqueEmailDestinatarios.trim(),
    smtpHost: payload.smtpHost.trim(),
    smtpPort: payload.smtpPort > 0 ? payload.smtpPort : defaultConfig.smtpPort,
    smtpSecure: payload.smtpSecure === true,
    smtpUsuario: payload.smtpUsuario.trim(),
    smtpSenha: payload.smtpSenha,
    smtpRemetente: payload.smtpRemetente.trim(),
  };

  if (normalizedBase.desktopVinculoAtivo && !normalizedBase.desktopInstalacaoAutorizadaId.trim()) {
    return {
      success: false,
      error: 'Para ativar a blindagem desktop, vincule primeiro uma instalacao autorizada.',
    };
  }

  if (normalizedBase.desktopVinculoAtivo && !normalizedBase.desktopInstalacaoAutorizadaNome.trim()) {
    return {
      success: false,
      error: 'A instalacao autorizada precisa possuir identificacao nominal para auditoria e governanca.',
    };
  }

  if (normalizedBase.desktopLicencaExpiraEm && !Number.isFinite(new Date(normalizedBase.desktopLicencaExpiraEm).getTime())) {
    return {
      success: false,
      error: 'A expiracao da licenca desktop precisa estar em formato de data valido.',
    };
  }

  if (normalizedBase.desktopLicencaToken && !normalizedBase.desktopLicencaEmitidaPara) {
    return {
      success: false,
      error: 'Informe para quem a licenca desktop foi emitida.',
    };
  }

  const normalized: ConfiguracaoSistema = normalizedBase.desktopVinculoAtivo
    ? {
        ...normalizedBase,
        desktopInstalacaoAutorizadaId: normalizedBase.desktopInstalacaoAutorizadaId.trim(),
        desktopInstalacaoAutorizadaNome: normalizedBase.desktopInstalacaoAutorizadaNome.trim(),
        desktopUltimaValidacaoEm: normalizedBase.desktopUltimaValidacaoEm || new Date().toISOString(),
      }
    : {
        ...normalizedBase,
        desktopInstalacaoAutorizadaId: '',
        desktopInstalacaoAutorizadaNome: '',
        desktopUltimaValidacaoEm: '',
        desktopLicencaToken: '',
        desktopLicencaEmitidaPara: '',
        desktopLicencaExpiraEm: '',
      };

  if (normalized.materiaisNuvem && !hasSupabaseConfig()) {
    return {
      success: false,
      error:
        'Para ativar materiais em nuvem, a integracao Supabase precisa estar completa (URL e chave anon). No site em producao isso costuma vir do servidor; no desktop, preencha aqui ou no primeiro arranque.',
    };
  }

  const formUrl = Boolean(normalized.supabaseUrl);
  const formKey = Boolean(normalized.supabaseAnonKey);
  if ((formUrl && !formKey) || (!formUrl && formKey)) {
    return {
      success: false,
      error: 'Preencha URL e chave do Supabase em conjunto para evitar configuracao incompleta.',
    };
  }

  localStorage.setItem(configStorageKey(), JSON.stringify(normalized));
  aplicarTemaEfetivoNaSessao();

  const supabaseTargetChanged =
    normalized.supabaseUrl !== previous.supabaseUrl || normalized.supabaseAnonKey !== previous.supabaseAnonKey;
  if (supabaseTargetChanged) {
    invalidateIsoProSnapshotCache();
    resetSupabaseClient();
  }

  dispatchIsoProConfigUpdatedEvent();

  void syncOciUploadContextFromConfig({
    cliente: normalized.cliente,
    projeto: normalized.projeto,
  });

  if (hasSupabaseConfig()) {
    void sincronizarConfigAlertaEstoqueParaNuvem(normalized);
  }

  return { success: true, data: normalized };
}

export function registrarValidacaoDesktop(timestamp = new Date().toISOString()) {
  const current = readConfiguracoes();
  if (!current.desktopVinculoAtivo || !current.desktopInstalacaoAutorizadaId) {
    return current;
  }

  const lastValidationTime = current.desktopUltimaValidacaoEm ? new Date(current.desktopUltimaValidacaoEm).getTime() : 0;
  const nextValidationTime = new Date(timestamp).getTime();

  if (lastValidationTime && Number.isFinite(lastValidationTime) && nextValidationTime - lastValidationTime < 5 * 60 * 1000) {
    return current;
  }

  const next = {
    ...current,
    desktopUltimaValidacaoEm: timestamp,
  };
  localStorage.setItem(configStorageKey(), JSON.stringify(next));
  return next;
}

export function consumirSequenciaAtendimento() {
  const current = readConfiguracoes();
  const next = {
    ...current,
    sequenciaAtendimento: current.sequenciaAtendimento + 1,
  };
  localStorage.setItem(configStorageKey(), JSON.stringify(next));
  return next.sequenciaAtendimento;
}
