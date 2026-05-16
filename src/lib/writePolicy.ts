import { hasSupabaseConfig } from './supabase';
import type { ServiceResult } from '../types/common.types';

/**
 * Em build de producao (`npm run build`), gravacoes de dados de negocio apenas em localStorage
 * sao bloqueadas se o Supabase nao estiver configurado — evita trabalhar "achando que esta na nuvem".
 * Em desenvolvimento (`npm run dev`) o bloqueio fica desligado para nao travar programadores.
 */
export const BUSINESS_WRITE_BLOCKED_MESSAGE =
  'Build de producao exige Supabase configurado para gravar dados de negocio. Abra Configuracoes > Integracao Supabase, preencha URL e chave anon, salve e tente novamente. Ate la, os dados nao serao gravados apenas neste PC.';

export function isBusinessLocalWriteBlocked(): boolean {
  if (import.meta.env.DEV) return false;
  return !hasSupabaseConfig();
}

export function businessWriteBlockedFailure<T>(): ServiceResult<T> {
  return {
    success: false,
    error: BUSINESS_WRITE_BLOCKED_MESSAGE,
    meta: {
      source: 'local',
      writeBlocked: true,
    },
  };
}

/** Quando bloqueado, retorna falha; caso contrario `null` (chamar `return blocked` no servico). */
export function whenBusinessWriteBlockedResult<T>(): ServiceResult<T> | null {
  if (!isBusinessLocalWriteBlocked()) return null;
  return businessWriteBlockedFailure<T>();
}
