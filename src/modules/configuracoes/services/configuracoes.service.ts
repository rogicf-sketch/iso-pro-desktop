import { LOGO_INSTITUCIONAL_PADRAO_FABRICA } from '../../../lib/logoInstitucional.constants';
import { invalidateIsoProSnapshotCache } from '../../../lib/isoProSnapshot';
import { resetSupabaseClient } from '../../../lib/supabase';
import type { ServiceResult } from '../../../types/common.types';
import type { ConfiguracaoSistema, RirProcedimentoCadastroItem } from '../types/configuracao.types';

const STORAGE_KEY = 'iso-pro-desktop-configuracoes-sistema';

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

const defaultConfig: ConfiguracaoSistema = {
  cliente: '',
  projeto: '',
  contrato: '',
  local: '',
  tema: 'neon',
  sequenciaAtendimento: 0,
  rirModoNumeracao: 'auto',
  rirProcedimentosCadastro: [] as RirProcedimentoCadastroItem[],
  rirPrefSenha: '',
  rncPrefSenha: '',
  materiaisNuvem: false,
  supabaseUrl: '',
  supabaseAnonKey: '',
  desktopVinculoAtivo: false,
  desktopInstalacaoAutorizadaId: '',
  desktopInstalacaoAutorizadaNome: '',
  desktopUltimaValidacaoEm: '',
  desktopLicencaToken: '',
  desktopLicencaEmitidaPara: '',
  desktopLicencaExpiraEm: '',
  logoInstitucionalUrl: LOGO_INSTITUCIONAL_PADRAO_FABRICA,
};

export function aplicarTemaSistema(tema: ConfiguracaoSistema['tema']) {
  if (typeof document === 'undefined') return;
  document.body.classList.remove('theme-padrao', 'theme-escuro', 'theme-claro', 'theme-verde', 'theme-neon');
  document.body.classList.add(`theme-${tema}`);
}

export function readConfiguracoes(): ConfiguracaoSistema {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultConfig));
    return defaultConfig;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ConfiguracaoSistema> & { reciboLogoUrl?: string };
    const logoBruto = (parsed.logoInstitucionalUrl ?? parsed.reciboLogoUrl ?? '').trim();
    const logoInstitucionalUrl = logoBruto || LOGO_INSTITUCIONAL_PADRAO_FABRICA;
    const rirProcedimentosCadastro = Array.isArray(parsed.rirProcedimentosCadastro)
      ? (parsed.rirProcedimentosCadastro as RirProcedimentoCadastroItem[])
      : defaultConfig.rirProcedimentosCadastro;
    return {
      ...defaultConfig,
      ...parsed,
      tema: normalizeTema(parsed.tema),
      rirModoNumeracao: normalizeRirModoNumeracao(parsed.rirModoNumeracao),
      logoInstitucionalUrl,
      rirProcedimentosCadastro,
    };
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultConfig));
    return defaultConfig;
  }
}

export async function carregarConfiguracoes(): Promise<ConfiguracaoSistema> {
  const config = readConfiguracoes();
  aplicarTemaSistema(config.tema);
  return config;
}

export async function salvarConfiguracoes(payload: ConfiguracaoSistema): Promise<ServiceResult<ConfiguracaoSistema>> {
  const previous = readConfiguracoes();

  const normalizedBase: ConfiguracaoSistema = {
    ...payload,
    tema: normalizeTema(payload.tema),
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
    supabaseUrl: payload.supabaseUrl.trim(),
    supabaseAnonKey: payload.supabaseAnonKey.trim(),
    desktopLicencaToken: payload.desktopLicencaToken.trim(),
    desktopLicencaEmitidaPara: payload.desktopLicencaEmitidaPara.trim(),
    desktopLicencaExpiraEm: payload.desktopLicencaExpiraEm.trim(),
    logoInstitucionalUrl: payload.logoInstitucionalUrl.trim() || LOGO_INSTITUCIONAL_PADRAO_FABRICA,
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

  if (normalized.materiaisNuvem && (!normalized.supabaseUrl || !normalized.supabaseAnonKey)) {
    return {
      success: false,
      error: 'Para ativar materiais em nuvem, informe a URL e a chave anon/publicavel do Supabase.',
    };
  }

  if ((normalized.supabaseUrl && !normalized.supabaseAnonKey) || (!normalized.supabaseUrl && normalized.supabaseAnonKey)) {
    return {
      success: false,
      error: 'Preencha URL e chave do Supabase em conjunto para evitar configuracao incompleta.',
    };
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  aplicarTemaSistema(normalized.tema);

  const supabaseTargetChanged =
    normalized.supabaseUrl !== previous.supabaseUrl || normalized.supabaseAnonKey !== previous.supabaseAnonKey;
  if (supabaseTargetChanged) {
    invalidateIsoProSnapshotCache();
    resetSupabaseClient();
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function consumirSequenciaAtendimento() {
  const current = readConfiguracoes();
  const next = {
    ...current,
    sequenciaAtendimento: current.sequenciaAtendimento + 1,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next.sequenciaAtendimento;
}
