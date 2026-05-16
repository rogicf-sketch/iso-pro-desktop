import { getActiveTenantId } from '../../../lib/isoProTenant';
import { invalidateIsoProSnapshotCache } from '../../../lib/isoProSnapshot';
import { getSupabase, hasSupabaseConfig } from '../../../lib/supabase';
import type { ServiceResult } from '../../../types/common.types';
import {
  PURGE_CLOUD_FRASE_OPERACIONAL,
  PURGE_CLOUD_FRASE_UTILIZADORES,
} from '../constants/purgeCloud.constants';

export type PurgeNuvemIsoProInput = {
  login: string;
  senha: string;
  confirmFraseOperacional: string;
  incluirUtilizadoresEPerfis: boolean;
  confirmFraseUtilizadores: string;
};

type PurgeResponseBody = {
  ok?: boolean;
  message?: string;
  incluirUtilizadoresEPerfis?: boolean;
};

/**
 * Invoca a Edge Function `purge_cloud_data` no projecto Supabase configurado no desktop.
 * Envia `tenantId` = empresa activa (`getActiveTenantId()`); a purge e apenas desse tenant.
 * Requer a funcao publicada no Supabase (ver `supabase/functions/README.md`).
 */
export async function executarPurgeNuvemIsoPro(
  input: PurgeNuvemIsoProInput,
): Promise<ServiceResult<{ message: string; incluirUtilizadoresEPerfis: boolean }>> {
  if (!hasSupabaseConfig()) {
    return { success: false, error: 'Supabase nao configurado.' };
  }
  const supabase = getSupabase();
  if (!supabase) {
    return { success: false, error: 'Cliente Supabase indisponivel.' };
  }

  const trimmedOper = input.confirmFraseOperacional.trim();
  if (trimmedOper !== PURGE_CLOUD_FRASE_OPERACIONAL) {
    return {
      success: false,
      error: `Frase de confirmacao invalida. Utilize exactamente: ${PURGE_CLOUD_FRASE_OPERACIONAL}`,
    };
  }

  if (input.incluirUtilizadoresEPerfis && input.confirmFraseUtilizadores.trim() !== PURGE_CLOUD_FRASE_UTILIZADORES) {
    return {
      success: false,
      error: `Para apagar utilizadores e perfis, escreva tambem: ${PURGE_CLOUD_FRASE_UTILIZADORES}`,
    };
  }

  const { data, error } = await supabase.functions.invoke<PurgeResponseBody>('purge_cloud_data', {
    body: {
      tenantId: getActiveTenantId(),
      login: input.login.trim().toLowerCase(),
      senha: input.senha,
      confirmFraseOperacional: trimmedOper,
      incluirUtilizadoresEPerfis: input.incluirUtilizadoresEPerfis,
      confirmFraseUtilizadores: input.confirmFraseUtilizadores.trim(),
    },
  });

  if (error) {
    const msg = await extrairMensagemErroFunctionsInvoke(error);
    return { success: false, error: msg };
  }

  const body = data;
  if (body && body.ok === false && body.message) {
    return { success: false, error: body.message };
  }
  if (!body?.ok) {
    return { success: false, error: body?.message ?? 'Resposta inesperada da funcao purge_cloud_data.' };
  }

  invalidateIsoProSnapshotCache();
  return {
    success: true,
    data: {
      message: body.message ?? 'Purge na nuvem concluida.',
      incluirUtilizadoresEPerfis: Boolean(body.incluirUtilizadoresEPerfis),
    },
  };
}

async function extrairMensagemErroFunctionsInvoke(error: unknown): Promise<string> {
  if (error instanceof Error && error.message) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const j = (await ctx.json()) as PurgeResponseBody;
        if (j?.message) return j.message;
      } catch {
        /* ignora */
      }
    }
    return error.message;
  }
  return 'Falha ao invocar purge_cloud_data.';
}
