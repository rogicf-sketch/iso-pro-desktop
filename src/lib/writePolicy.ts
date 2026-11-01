import { APP_VERSION } from '@/appMeta';
import { FORCE_UPDATE_BELOW_VERSION, getAppUpdatePolicy } from './appVersionPolicy';
import { isFeatureEnabled } from './isoProFeatureFlags';
import { hasSupabaseConfig } from './supabase';
import type { ServiceResult } from '../types/common.types';

/**
 * Em build de producao (`npm run build`), gravacoes de dados de negocio apenas em localStorage
 * sao bloqueadas se o Supabase nao estiver configurado — evita trabalhar "achando que esta na nuvem".
 * Em desenvolvimento (`npm run dev`) o bloqueio fica desligado para nao travar programadores.
 *
 * Versao abaixo de FORCE_UPDATE_BELOW_VERSION com `force_update_gate`: bloqueia writes (clientes
 * incompativeis nao mutam SoT).
 */
export const BUSINESS_WRITE_BLOCKED_MESSAGE =
  'Build de producao exige Supabase configurado para gravar dados de negocio. Abra Configuracoes > Integracao Supabase, preencha URL e chave anon, salve e tente novamente. Ate la, os dados nao serao gravados apenas neste PC.';

export const FORCE_UPDATE_WRITE_BLOCKED_MESSAGE = `Actualizacao obrigatoria: esta instalacao (v${APP_VERSION}) esta abaixo de ${FORCE_UPDATE_BELOW_VERSION}. Instale o Setup actual antes de gravar dados de negocio.`;

export function isForceUpdateWriteBlocked(): boolean {
  if (!isFeatureEnabled('force_update_gate')) return false;
  return getAppUpdatePolicy(APP_VERSION).forceUpdate;
}

export function isBusinessLocalWriteBlocked(): boolean {
  // Force-update aplica mesmo em DEV (clientes abaixo do limiar nao mutam SoT).
  if (isForceUpdateWriteBlocked()) return true;
  if (import.meta.env.DEV) return false;
  return !hasSupabaseConfig();
}

export function businessWriteBlockedFailure<T>(): ServiceResult<T> {
  const force = isForceUpdateWriteBlocked();
  return {
    success: false,
    error: force ? FORCE_UPDATE_WRITE_BLOCKED_MESSAGE : BUSINESS_WRITE_BLOCKED_MESSAGE,
    meta: {
      source: 'local',
      writeBlocked: true,
      ...(force ? { forceUpdate: true } : {}),
    },
  };
}

/** Quando bloqueado, retorna falha; caso contrario `null` (chamar `return blocked` no servico). */
export function whenBusinessWriteBlockedResult<T>(): ServiceResult<T> | null {
  if (!isBusinessLocalWriteBlocked()) return null;
  return businessWriteBlockedFailure<T>();
}
