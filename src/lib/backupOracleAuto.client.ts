import type { ConfiguracaoSistema } from '../modules/configuracoes/types/configuracao.types';
import { getRuntimeSupabaseConfig } from './supabase';

export type BackupOracleActivityKind = 'atendimento' | 'recebimento' | 'cadastro';

export type BackupOracleRuntimeSettings = {
  habilitado: boolean;
  intervaloRotinaDias: number;
  intervaloFluxoAltoDias: number;
  minAtendimentosFluxo: number;
  minRecebimentosFluxo: number;
  minCadastrosFluxo: number;
  supabaseUrl: string;
  supabaseAnonKey: string;
  cliente: string;
  projeto: string;
};

export function backupOracleSettingsFromConfig(
  config: Pick<
    ConfiguracaoSistema,
    | 'backupOracleAutomaticoHabilitado'
    | 'backupOracleIntervaloRotinaDias'
    | 'backupOracleIntervaloFluxoAltoDias'
    | 'backupOracleMinAtendimentosFluxo'
    | 'backupOracleMinRecebimentosFluxo'
    | 'backupOracleMinCadastrosFluxo'
    | 'supabaseUrl'
    | 'supabaseAnonKey'
    | 'cliente'
    | 'projeto'
  >,
): BackupOracleRuntimeSettings {
  return {
    habilitado: config.backupOracleAutomaticoHabilitado === true,
    intervaloRotinaDias: Math.max(1, config.backupOracleIntervaloRotinaDias || 7),
    intervaloFluxoAltoDias: Math.max(1, config.backupOracleIntervaloFluxoAltoDias || 3),
    minAtendimentosFluxo: Math.max(1, config.backupOracleMinAtendimentosFluxo || 10),
    minRecebimentosFluxo: Math.max(1, config.backupOracleMinRecebimentosFluxo || 3),
    minCadastrosFluxo: Math.max(1, config.backupOracleMinCadastrosFluxo || 5),
    supabaseUrl: config.supabaseUrl.trim(),
    supabaseAnonKey: config.supabaseAnonKey.trim(),
    cliente: config.cliente.trim(),
    projeto: config.projeto.trim(),
  };
}

/** Regista movimento operacional (so Electron). */
export function registrarAtividadeBackupOracle(kind: BackupOracleActivityKind): void {
  if (typeof window === 'undefined') return;
  const api = window.isoProDesktop?.registrarAtividadeBackupOracle;
  if (!api) return;
  void api(kind).catch(() => {
    /* nao bloquear operacao */
  });
}

export async function sincronizarBackupOracleSettings(
  settings: BackupOracleRuntimeSettings,
): Promise<void> {
  if (typeof window === 'undefined') return;
  const api = window.isoProDesktop?.syncBackupOracleSettings;
  if (!api) return;
  try {
    await api(settings);
  } catch {
    /* nao bloquear gravacao de configuracoes */
  }
}

export async function sincronizarBackupOracleSettingsFromConfig(
  config: ConfiguracaoSistema,
): Promise<void> {
  const runtime = getRuntimeSupabaseConfig();
  await sincronizarBackupOracleSettings({
    ...backupOracleSettingsFromConfig(config),
    supabaseUrl: config.supabaseUrl.trim() || runtime.url,
    supabaseAnonKey: config.supabaseAnonKey.trim() || runtime.key,
  });
}

export async function executarBackupOracleAgora(): Promise<
  { ok: true; detail: string } | { ok: false; error: string }
> {
  const api = window.isoProDesktop?.executarBackupOracleAgora;
  if (!api) {
    return { ok: false, error: 'Backup Oracle automatico so esta disponivel no app desktop (Electron).' };
  }
  return api();
}

export async function obterEstadoBackupOracle(): Promise<
  | {
      ok: true;
      ultimoBackupEm: string | null;
      ultimoBackupOk: boolean;
      ultimoErro: string;
      atividade: { atendimentos: number; recebimentos: number; cadastros: number };
      backupEmCurso: boolean;
    }
  | { ok: false; error: string }
> {
  const api = window.isoProDesktop?.obterEstadoBackupOracle;
  if (!api) {
    return { ok: false, error: 'Indisponivel fora do desktop.' };
  }
  return api();
}
