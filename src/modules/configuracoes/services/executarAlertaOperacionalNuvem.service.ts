import { getActiveTenantId } from '../../../lib/isoProTenant';
import { getSupabase, hasSupabaseConfig } from '../../../lib/supabase';
import type { ServiceResult } from '../../../types/common.types';

export type ExecutarAlertaOperacionalNuvemInput = {
  login: string;
  senha: string;
  forcar?: boolean;
};

type AlertaOperacionalResponse = {
  ok?: boolean;
  message?: string;
  enviados?: number;
  pendencias?: number;
};

async function extrairMensagemErroFunctionsInvoke(error: unknown): Promise<string> {
  if (error && typeof error === 'object' && 'context' in error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx instanceof Response) {
      try {
        const body = (await ctx.json()) as { message?: string };
        if (body.message) return body.message;
      } catch {
        /* ignore */
      }
    }
  }
  return error instanceof Error ? error.message : 'Falha ao invocar funcao na nuvem.';
}

export async function executarAlertaOperacionalNuvem(
  input: ExecutarAlertaOperacionalNuvemInput,
): Promise<ServiceResult<{ message: string; enviados: number; pendencias: number }>> {
  if (!hasSupabaseConfig()) {
    return { success: false, error: 'Supabase nao configurado.' };
  }
  const supabase = getSupabase();
  if (!supabase) {
    return { success: false, error: 'Cliente Supabase indisponivel.' };
  }

  const { data, error } = await supabase.functions.invoke<AlertaOperacionalResponse>('alerta_operacional', {
    body: {
      tenantId: getActiveTenantId(),
      login: input.login.trim().toLowerCase(),
      senha: input.senha,
      forcar: input.forcar === true,
    },
  });

  if (error) {
    return { success: false, error: await extrairMensagemErroFunctionsInvoke(error) };
  }

  if (!data?.ok) {
    return { success: false, error: data?.message ?? 'Resposta inesperada da funcao alerta_operacional.' };
  }

  return {
    success: true,
    data: {
      message: data.message ?? 'Processado.',
      enviados: data.enviados ?? 0,
      pendencias: data.pendencias ?? 0,
    },
  };
}
