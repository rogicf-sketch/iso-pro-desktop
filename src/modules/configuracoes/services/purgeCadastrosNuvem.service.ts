import { getActiveTenantId } from '../../../lib/isoProTenant';
import { invalidateIsoProSnapshotCache } from '../../../lib/isoProSnapshot';
import { getSupabase, hasSupabaseConfig } from '../../../lib/supabase';
import type { ServiceResult } from '../../../types/common.types';
import { LIMPAR_CADASTROS_FRASE_NUVEM } from '../constants/limparCadastros.constants';

type PurgeCadastrosResponse = {
  ok?: boolean;
  message?: string;
};

export type PurgeCadastrosNuvemInput = {
  login: string;
  senha: string;
  confirmFrase: string;
};

/**
 * Apaga na nuvem apenas cadastros operacionais **do tenant activo** (`getActiveTenantId()`): tabela `materiais`,
 * `dispositivos_mobile`, listas no `iso_pro_snapshot` (mantendo `configuracoesSistema`), e repoe `iso_pro_relatorio_snapshot`.
 * Nao altera `usuarios_sistema`, perfis, permissoes nem `desktop_licencas`.
 */
export async function executarPurgeCadastrosNuvem(
  input: PurgeCadastrosNuvemInput,
): Promise<ServiceResult<{ message: string }>> {
  if (!hasSupabaseConfig()) {
    return { success: false, error: 'Supabase nao configurado.' };
  }
  const supabase = getSupabase();
  if (!supabase) {
    return { success: false, error: 'Cliente Supabase indisponivel.' };
  }

  if (input.confirmFrase.trim() !== LIMPAR_CADASTROS_FRASE_NUVEM) {
    return {
      success: false,
      error: `Frase invalida. Escreva exactamente: ${LIMPAR_CADASTROS_FRASE_NUVEM}`,
    };
  }

  const { data, error } = await supabase.functions.invoke<PurgeCadastrosResponse>('purge_cloud_cadastros', {
    body: {
      tenantId: getActiveTenantId(),
      login: input.login.trim().toLowerCase(),
      senha: input.senha,
      confirmFrase: input.confirmFrase.trim(),
    },
  });

  if (error) {
    const msg = await extrairMensagemErro(error);
    return { success: false, error: msg };
  }

  const body = data;
  if (body && body.ok === false && body.message) {
    return { success: false, error: body.message };
  }
  if (!body?.ok) {
    return { success: false, error: body?.message ?? 'Resposta inesperada de purge_cloud_cadastros.' };
  }

  invalidateIsoProSnapshotCache();
  return { success: true, data: { message: body.message ?? 'Cadastros na nuvem limpos.' } };
}

async function extrairMensagemErro(error: unknown): Promise<string> {
  if (error instanceof Error && error.message) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const j = (await ctx.json()) as PurgeCadastrosResponse;
        if (j?.message) return j.message;
      } catch {
        /* ignora */
      }
    }
    return error.message;
  }
  return 'Falha ao invocar purge_cloud_cadastros.';
}
