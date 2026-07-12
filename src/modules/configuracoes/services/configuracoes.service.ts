import {
  centroCustoAmbientePreenchido,
  getAmbienteAtivoId,
  getScopedIsoProStorageKey,
  getScopedIsoProStorageKeyForAmbienteId,
  type IsoProCentroCustoAmbiente,
} from '../../../lib/isoProAmbiente';
import { avisarPreservacaoLocalStorageCorrupto } from '../../../lib/localStoragePreservacao';
import { dispatchIsoProConfigUpdatedEvent } from '../../../lib/configEvents';
import { getCurrentUser } from '../../auth/services/auth.service';
import { LOGO_INSTITUCIONAL_PADRAO_FABRICA } from '../../../lib/logoInstitucional.constants';
import { invalidateIsoProSnapshotCache } from '../../../lib/isoProSnapshot';
import { readSnapshotRemoteSliceOrFull } from '../../../lib/snapshotSliceRead';
import { getSupabaseConfigDiagnostics, hasSupabaseConfig, resetSupabaseClient } from '../../../lib/supabase';
import {
  readIsoProCloudConnectionComMigracao,
  writeIsoProCloudConnection,
} from '../../../lib/isoProCloudConnection';
import type { ServiceResult } from '../../../types/common.types';
import { parseConfiguracaoJson } from '../schemas/configuracaoPersistido.zod';
import type { ConfiguracaoSistema, RirProcedimentoCadastroItem } from '../types/configuracao.types';
import { normalizeIaApiBaseUrl } from '../../../lib/isoProIaApi.service';
import { LEGACY_LOGO_STORAGE_KEY_BASE } from '../../../lib/logoInstitucional';
import { syncOciUploadContextFromConfig } from './ociUploadContextSync.service';
import { sincronizarConfigAlertaEstoqueParaNuvem } from './syncAlertaEstoqueConfigNuvem.service';
import {
  type ConfigReciboMobileSnapshot,
  logoInstitucionalLocalConfigurado,
  reciboConfigLocalPendenteEnvioNuvem,
} from '../utils/configReciboMobileSnapshot';
import { sincronizarBackupOracleSettingsFromConfig } from '../../../lib/backupOracleAuto.client';
import {
  hydrateConfigSecretsVault,
  mergeConfigSecrets,
  persistConfigSecretsVault,
} from '../../../lib/configSecrets.client';
import { normalizeTemaSistemaId } from '../../../lib/temaSistema';

const STORAGE_KEY_BASE = 'iso-pro-desktop-configuracoes-sistema';

function configStorageKey(): string {
  return getScopedIsoProStorageKey(STORAGE_KEY_BASE);
}

const TEMAS_VALIDOS: ConfiguracaoSistema['tema'][] = ['padrao', 'escuro', 'hibrido', 'campo', 'verde', 'neon'];
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
  return normalizeTemaSistemaId(t, 'padrao');
}

const defaultConfig: ConfiguracaoSistema = {
  cliente: '',
  projeto: '',
  contrato: '',
  local: '',
  tema: 'campo',
  mostrarAjudaModulos: true,
  sequenciaAtendimento: 0,
  rirModoNumeracao: 'auto',
  rirProcedimentosCadastro: [] as RirProcedimentoCadastroItem[],
  rirPrefSenha: '',
  rncPrefSenha: '',
  /** Padrao: materiais no `iso_pro_snapshot` (mobile + web alinhados). Ativar tabela `materiais` so em Configuracoes. */
  materiaisNuvem: false,
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
  alertaOperacionalEmailHabilitado: false,
  alertaOperacionalEmailDestinatarios: '',
  alertaOperacionalConferenciaHabilitado: true,
  alertaOperacionalConferenciaPrazoDias: 2,
  alertaOperacionalRirHabilitado: true,
  alertaOperacionalRirPrazoDias: 5,
  alertaOperacionalRncHabilitado: true,
  alertaOperacionalRncPrazoDias: 7,
  alertaOperacionalInventarioHabilitado: false,
  alertaOperacionalInventarioPrazoDias: 7,
  alertaOperacionalIntervaloMinimoHoras: 24,
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  smtpUsuario: '',
  smtpSenha: '',
  smtpRemetente: '',
  backupOracleAutomaticoHabilitado: true,
  backupOracleIntervaloRotinaDias: 7,
  backupOracleIntervaloFluxoAltoDias: 3,
  backupOracleMinAtendimentosFluxo: 10,
  backupOracleMinRecebimentosFluxo: 3,
  backupOracleMinCadastrosFluxo: 5,
  pdfNuvemHabilitado: true,
  pdfNuvemTimeoutSegundos: 90,
};

function normalizeRelatorioFinalIaBaseUrl(url: unknown): string {
  return normalizeIaApiBaseUrl(url);
}

export function aplicarTemaSistema(tema: ConfiguracaoSistema['tema']) {
  if (typeof document === 'undefined') return;
  document.body.classList.remove('theme-padrao', 'theme-escuro', 'theme-hibrido', 'theme-campo', 'theme-verde', 'theme-neon');
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
  const mapped = normalizeTemaSistemaId(raw, 'padrao');
  return TEMAS_VALIDOS.includes(mapped) ? mapped : null;
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

function aplicarCloudConnectionNaConfiguracao(config: ConfiguracaoSistema): ConfiguracaoSistema {
  const diag = getSupabaseConfigDiagnostics();
  const cloud = readIsoProCloudConnectionComMigracao();
  if (diag.urlFrom === 'vite-env' && diag.keyFrom === 'vite-env') {
    return {
      ...config,
      supabaseUrl: '',
      supabaseAnonKey: '',
      materiaisNuvem: cloud?.materiaisNuvem ?? config.materiaisNuvem,
    };
  }
  if (!cloud) return config;
  return {
    ...config,
    supabaseUrl: cloud.supabaseUrl,
    supabaseAnonKey: cloud.supabaseAnonKey,
    materiaisNuvem: cloud.materiaisNuvem,
  };
}

export function readConfiguracoes(): ConfiguracaoSistema {
  const raw = localStorage.getItem(configStorageKey());
  if (!raw) {
    localStorage.setItem(configStorageKey(), JSON.stringify(defaultConfig));
    return aplicarCloudConnectionNaConfiguracao(mergeConfigSecrets(defaultConfig));
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const validated = parseConfiguracaoJson(parsed);
    if (!validated) {
      avisarPreservacaoLocalStorageCorrupto('Configuracoes', configStorageKey());
      return aplicarCloudConnectionNaConfiguracao(mergeConfigSecrets({ ...defaultConfig }));
    }
    const parsedConfig = validated as Partial<ConfiguracaoSistema> & { reciboLogoUrl?: string };
    const logoBruto = (parsedConfig.logoInstitucionalUrl ?? parsedConfig.reciboLogoUrl ?? '').trim();
    const logoInstitucionalUrl = logoBruto || LOGO_INSTITUCIONAL_PADRAO_FABRICA;
    const rirProcedimentosCadastro = Array.isArray(parsedConfig.rirProcedimentosCadastro)
      ? (parsedConfig.rirProcedimentosCadastro as RirProcedimentoCadastroItem[])
      : defaultConfig.rirProcedimentosCadastro;
    const merged = {
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
      alertaOperacionalEmailHabilitado: parsedConfig.alertaOperacionalEmailHabilitado === true,
      alertaOperacionalEmailDestinatarios: String(parsedConfig.alertaOperacionalEmailDestinatarios ?? '').trim(),
      alertaOperacionalConferenciaHabilitado: parsedConfig.alertaOperacionalConferenciaHabilitado !== false,
      alertaOperacionalConferenciaPrazoDias:
        Number(parsedConfig.alertaOperacionalConferenciaPrazoDias) > 0
          ? Number(parsedConfig.alertaOperacionalConferenciaPrazoDias)
          : defaultConfig.alertaOperacionalConferenciaPrazoDias,
      alertaOperacionalRirHabilitado: parsedConfig.alertaOperacionalRirHabilitado !== false,
      alertaOperacionalRirPrazoDias:
        Number(parsedConfig.alertaOperacionalRirPrazoDias) > 0
          ? Number(parsedConfig.alertaOperacionalRirPrazoDias)
          : defaultConfig.alertaOperacionalRirPrazoDias,
      alertaOperacionalRncHabilitado: parsedConfig.alertaOperacionalRncHabilitado !== false,
      alertaOperacionalRncPrazoDias:
        Number(parsedConfig.alertaOperacionalRncPrazoDias) > 0
          ? Number(parsedConfig.alertaOperacionalRncPrazoDias)
          : defaultConfig.alertaOperacionalRncPrazoDias,
      alertaOperacionalInventarioHabilitado: parsedConfig.alertaOperacionalInventarioHabilitado === true,
      alertaOperacionalInventarioPrazoDias:
        Number(parsedConfig.alertaOperacionalInventarioPrazoDias) > 0
          ? Number(parsedConfig.alertaOperacionalInventarioPrazoDias)
          : defaultConfig.alertaOperacionalInventarioPrazoDias,
      alertaOperacionalIntervaloMinimoHoras:
        Number(parsedConfig.alertaOperacionalIntervaloMinimoHoras) > 0
          ? Number(parsedConfig.alertaOperacionalIntervaloMinimoHoras)
          : defaultConfig.alertaOperacionalIntervaloMinimoHoras,
      smtpHost: String(parsedConfig.smtpHost ?? '').trim(),
      smtpPort: Number.isFinite(Number(parsedConfig.smtpPort)) && Number(parsedConfig.smtpPort) > 0
        ? Number(parsedConfig.smtpPort)
        : defaultConfig.smtpPort,
      smtpSecure: parsedConfig.smtpSecure === true,
      smtpUsuario: String(parsedConfig.smtpUsuario ?? '').trim(),
      smtpSenha: String(parsedConfig.smtpSenha ?? ''),
      smtpRemetente: String(parsedConfig.smtpRemetente ?? '').trim(),
      backupOracleAutomaticoHabilitado: parsedConfig.backupOracleAutomaticoHabilitado !== false,
      backupOracleIntervaloRotinaDias: Number(parsedConfig.backupOracleIntervaloRotinaDias) > 0
        ? Number(parsedConfig.backupOracleIntervaloRotinaDias)
        : defaultConfig.backupOracleIntervaloRotinaDias,
      backupOracleIntervaloFluxoAltoDias: Number(parsedConfig.backupOracleIntervaloFluxoAltoDias) > 0
        ? Number(parsedConfig.backupOracleIntervaloFluxoAltoDias)
        : defaultConfig.backupOracleIntervaloFluxoAltoDias,
      backupOracleMinAtendimentosFluxo: Number(parsedConfig.backupOracleMinAtendimentosFluxo) > 0
        ? Number(parsedConfig.backupOracleMinAtendimentosFluxo)
        : defaultConfig.backupOracleMinAtendimentosFluxo,
      backupOracleMinRecebimentosFluxo: Number(parsedConfig.backupOracleMinRecebimentosFluxo) > 0
        ? Number(parsedConfig.backupOracleMinRecebimentosFluxo)
        : defaultConfig.backupOracleMinRecebimentosFluxo,
      backupOracleMinCadastrosFluxo: Number(parsedConfig.backupOracleMinCadastrosFluxo) > 0
        ? Number(parsedConfig.backupOracleMinCadastrosFluxo)
        : defaultConfig.backupOracleMinCadastrosFluxo,
      pdfNuvemHabilitado: parsedConfig.pdfNuvemHabilitado !== false,
      pdfNuvemTimeoutSegundos:
        Number(parsedConfig.pdfNuvemTimeoutSegundos) >= 15 && Number(parsedConfig.pdfNuvemTimeoutSegundos) <= 300
          ? Number(parsedConfig.pdfNuvemTimeoutSegundos)
          : defaultConfig.pdfNuvemTimeoutSegundos,
    };
    return aplicarCloudConnectionNaConfiguracao(mergeConfigSecrets(merged));
  } catch {
    avisarPreservacaoLocalStorageCorrupto('Configuracoes', configStorageKey());
    return aplicarCloudConnectionNaConfiguracao(mergeConfigSecrets({ ...defaultConfig }));
  }
}

/** Tema visível na sessão: preferência pessoal (se existir) ou tema gravado na configuração da instalação. */
export function readTemaEfetivoParaSessao(): ConfiguracaoSistema['tema'] {
  return readUsuarioTemaPreferido() ?? readConfiguracoes().tema;
}

export function aplicarTemaEfetivoNaSessao(): void {
  aplicarTemaSistema(readTemaEfetivoParaSessao());
}

function bootstrapSyncReciboConfigSessionKey(): string {
  return getScopedIsoProStorageKey('iso-pro-recibo-bootstrap-sync-session');
}

/** Indica se logo/CNPJ locais ainda nao foram enviados ao snapshot na nuvem. */
export async function consultarReciboConfigPendenteNuvem(
  config: ConfiguracaoSistema,
): Promise<boolean> {
  if (!hasSupabaseConfig()) return false;
  try {
    const payload = await readSnapshotRemoteSliceOrFull<{ configuracoesSistema?: ConfigReciboMobileSnapshot }>([
      'configuracoesSistema',
    ]);
    const nuvem = payload?.configuracoesSistema;
    return reciboConfigLocalPendenteEnvioNuvem(config, nuvem);
  } catch {
    return false;
  }
}

async function tentarBootstrapSyncReciboConfigNuvem(config: ConfiguracaoSistema): Promise<void> {
  if (!hasSupabaseConfig() || typeof sessionStorage === 'undefined') return;
  if (sessionStorage.getItem(bootstrapSyncReciboConfigSessionKey())) return;
  sessionStorage.setItem(bootstrapSyncReciboConfigSessionKey(), '1');

  try {
    const pendente = await consultarReciboConfigPendenteNuvem(config);
    if (!pendente) return;
    await sincronizarConfigAlertaEstoqueParaNuvem(config);
    invalidateIsoProSnapshotCache();
  } catch {
    /* bootstrap best-effort; utilizador pode gravar Config manualmente */
  }
}

/** Migra `iso-pro-desktop-recibo-logo-url` (legado) para `logoInstitucionalUrl` em Configuracoes. */
function migrateLegacyLogoInstitucionalStorage(): void {
  if (typeof localStorage === 'undefined') return;
  const legacyKey = getScopedIsoProStorageKey(LEGACY_LOGO_STORAGE_KEY_BASE);
  const legacy = localStorage.getItem(legacyKey)?.trim();
  if (!legacy) return;

  const config = readConfiguracoes();
  if (logoInstitucionalLocalConfigurado(config.logoInstitucionalUrl)) {
    localStorage.removeItem(legacyKey);
    return;
  }

  localStorage.setItem(
    configStorageKey(),
    JSON.stringify({ ...config, logoInstitucionalUrl: legacy }),
  );
  localStorage.removeItem(legacyKey);
  dispatchIsoProConfigUpdatedEvent();
}

export async function carregarConfiguracoes(): Promise<ConfiguracaoSistema> {
  const configBeforeVault = readConfiguracoes();
  const { migrated } = await hydrateConfigSecretsVault(configBeforeVault);
  if (migrated) {
    const stripped = await persistConfigSecretsVault(configBeforeVault);
    localStorage.setItem(configStorageKey(), JSON.stringify(stripped));
  }
  try {
    migrateLegacyLogoInstitucionalStorage();
  } catch {
    /* migracao best-effort */
  }
  const config = readConfiguracoes();
  aplicarTemaEfetivoNaSessao();
  void sincronizarBackupOracleSettingsFromConfig(config);
  void tentarBootstrapSyncReciboConfigNuvem(config);
  return config;
}

/** Grava centro de custo nas configurações isoladas de um ambiente de obra (ao criar obra nova). */
export function aplicarCentroCustoInicialNoAmbiente(ambienteId: string, centro: IsoProCentroCustoAmbiente): void {
  if (!centroCustoAmbientePreenchido(centro)) return;
  if (typeof localStorage === 'undefined') return;

  const key = getScopedIsoProStorageKeyForAmbienteId(STORAGE_KEY_BASE, ambienteId);
  let payload: Partial<ConfiguracaoSistema> = {};
  const raw = localStorage.getItem(key);
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      const validated = parseConfiguracaoJson(parsed);
      if (validated) payload = validated as Partial<ConfiguracaoSistema>;
    } catch {
      avisarPreservacaoLocalStorageCorrupto('Configuracoes', key);
    }
  }

  const next: ConfiguracaoSistema = {
    ...defaultConfig,
    ...payload,
    cliente: centro.cliente.trim() || payload.cliente?.trim() || defaultConfig.cliente,
    projeto: centro.projeto.trim() || payload.projeto?.trim() || defaultConfig.projeto,
    contrato: centro.contrato.trim() || payload.contrato?.trim() || defaultConfig.contrato,
    local: centro.local.trim() || payload.local?.trim() || defaultConfig.local,
  };
  localStorage.setItem(key, JSON.stringify(next));
  if (getAmbienteAtivoId() === ambienteId) {
    dispatchIsoProConfigUpdatedEvent();
  }
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
    alertaOperacionalEmailHabilitado: payload.alertaOperacionalEmailHabilitado === true,
    alertaOperacionalEmailDestinatarios: payload.alertaOperacionalEmailDestinatarios.trim(),
    alertaOperacionalConferenciaHabilitado: payload.alertaOperacionalConferenciaHabilitado !== false,
    alertaOperacionalConferenciaPrazoDias:
      payload.alertaOperacionalConferenciaPrazoDias > 0
        ? payload.alertaOperacionalConferenciaPrazoDias
        : defaultConfig.alertaOperacionalConferenciaPrazoDias,
    alertaOperacionalRirHabilitado: payload.alertaOperacionalRirHabilitado !== false,
    alertaOperacionalRirPrazoDias:
      payload.alertaOperacionalRirPrazoDias > 0 ? payload.alertaOperacionalRirPrazoDias : defaultConfig.alertaOperacionalRirPrazoDias,
    alertaOperacionalRncHabilitado: payload.alertaOperacionalRncHabilitado !== false,
    alertaOperacionalRncPrazoDias:
      payload.alertaOperacionalRncPrazoDias > 0 ? payload.alertaOperacionalRncPrazoDias : defaultConfig.alertaOperacionalRncPrazoDias,
    alertaOperacionalInventarioHabilitado: payload.alertaOperacionalInventarioHabilitado === true,
    alertaOperacionalInventarioPrazoDias:
      payload.alertaOperacionalInventarioPrazoDias > 0
        ? payload.alertaOperacionalInventarioPrazoDias
        : defaultConfig.alertaOperacionalInventarioPrazoDias,
    alertaOperacionalIntervaloMinimoHoras:
      payload.alertaOperacionalIntervaloMinimoHoras > 0
        ? payload.alertaOperacionalIntervaloMinimoHoras
        : defaultConfig.alertaOperacionalIntervaloMinimoHoras,
    smtpHost: payload.smtpHost.trim(),
    smtpPort: payload.smtpPort > 0 ? payload.smtpPort : defaultConfig.smtpPort,
    smtpSecure: payload.smtpSecure === true,
    smtpUsuario: payload.smtpUsuario.trim(),
    smtpSenha: payload.smtpSenha,
    smtpRemetente: payload.smtpRemetente.trim(),
    backupOracleAutomaticoHabilitado: payload.backupOracleAutomaticoHabilitado === true,
    backupOracleIntervaloRotinaDias:
      payload.backupOracleIntervaloRotinaDias > 0
        ? payload.backupOracleIntervaloRotinaDias
        : defaultConfig.backupOracleIntervaloRotinaDias,
    backupOracleIntervaloFluxoAltoDias:
      payload.backupOracleIntervaloFluxoAltoDias > 0
        ? payload.backupOracleIntervaloFluxoAltoDias
        : defaultConfig.backupOracleIntervaloFluxoAltoDias,
    backupOracleMinAtendimentosFluxo:
      payload.backupOracleMinAtendimentosFluxo > 0
        ? payload.backupOracleMinAtendimentosFluxo
        : defaultConfig.backupOracleMinAtendimentosFluxo,
    backupOracleMinRecebimentosFluxo:
      payload.backupOracleMinRecebimentosFluxo > 0
        ? payload.backupOracleMinRecebimentosFluxo
        : defaultConfig.backupOracleMinRecebimentosFluxo,
    backupOracleMinCadastrosFluxo:
      payload.backupOracleMinCadastrosFluxo > 0
        ? payload.backupOracleMinCadastrosFluxo
        : defaultConfig.backupOracleMinCadastrosFluxo,
    pdfNuvemHabilitado: payload.pdfNuvemHabilitado !== false,
    pdfNuvemTimeoutSegundos:
      payload.pdfNuvemTimeoutSegundos >= 15 && payload.pdfNuvemTimeoutSegundos <= 300
        ? payload.pdfNuvemTimeoutSegundos
        : defaultConfig.pdfNuvemTimeoutSegundos,
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

  localStorage.setItem(configStorageKey(), JSON.stringify(await persistConfigSecretsVault(normalized)));

  const diagPersist = getSupabaseConfigDiagnostics();
  writeIsoProCloudConnection({
    supabaseUrl:
      diagPersist.urlFrom === 'vite-env' ? '' : credenciaisSupabaseParaPersistir.url || normalized.supabaseUrl,
    supabaseAnonKey:
      diagPersist.keyFrom === 'vite-env' ? '' : credenciaisSupabaseParaPersistir.key || normalized.supabaseAnonKey,
    materiaisNuvem: normalized.materiaisNuvem,
  });

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

  void sincronizarBackupOracleSettingsFromConfig(normalized);

  let warning: string | undefined;
  let info: string | undefined;
  if (hasSupabaseConfig()) {
    const sync = await sincronizarConfigAlertaEstoqueParaNuvem(normalized);
    if (!sync.success) {
      warning =
        sync.error ??
        'Configuracoes salvas neste PC, mas nao foi possivel enviar logo/CNPJ e demais dados para a nuvem. O app Campo pode nao refletir as alteracoes ate a sincronizacao funcionar.';
    } else if (sync.data?.sincronizado) {
      info = 'Logo, CNPJ e dados do projeto foram enviados para a nuvem (app Campo). No telemovel, use «Carregar dados da nuvem».';
    }
  }

  if (warning) {
    return { success: true, data: normalized, warning, info };
  }
  if (info) {
    return { success: true, data: normalized, info };
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

export function consumirSequenciaAtendimento(snapshotMaxSequencia?: number) {
  const current = readConfiguracoes();
  const base = Math.max(current.sequenciaAtendimento, Number(snapshotMaxSequencia) || 0);
  const next = {
    ...current,
    sequenciaAtendimento: base + 1,
  };
  localStorage.setItem(configStorageKey(), JSON.stringify(next));
  return next.sequenciaAtendimento;
}
