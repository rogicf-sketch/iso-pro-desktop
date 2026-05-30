import { commitIsoProSnapshotWrite, readIsoProSnapshotPayloadForWrite } from '../../../lib/isoProSnapshot';
import { hasSupabaseConfig } from '../../../lib/supabase';
import type { ServiceResult } from '../../../types/common.types';
import type { ConfiguracaoSistema } from '../types/configuracao.types';
import {
  extrairConfigAlertaEstoqueParaSnapshot,
  lerConfigAlertaEstoqueDoSnapshot,
} from '../utils/configAlertaEstoqueSnapshot';

/**
 * Copia configuracao de alerta de estoque (SMTP + destinatarios) para `configuracoesSistema` no snapshot na nuvem.
 * Preserva `alertaEstoqueEmailState` gerido pela Edge Function.
 */
export async function sincronizarConfigAlertaEstoqueParaNuvem(
  config: ConfiguracaoSistema,
): Promise<ServiceResult<{ sincronizado: boolean }>> {
  if (!hasSupabaseConfig()) {
    return { success: true, data: { sincronizado: false } };
  }

  try {
    await commitIsoProSnapshotWrite(async () => {
      const { payload, baselineUpdatedAt } = await readIsoProSnapshotPayloadForWrite();
      const atual = lerConfigAlertaEstoqueDoSnapshot(payload.configuracoesSistema);
      const parcial = extrairConfigAlertaEstoqueParaSnapshot(config);
      const nextConfig = {
        ...(payload.configuracoesSistema && typeof payload.configuracoesSistema === 'object'
          ? (payload.configuracoesSistema as Record<string, unknown>)
          : {}),
        ...parcial,
        alertaEstoqueEmailState: atual.alertaEstoqueEmailState ?? {
          lastNotifiedCriticalIds: [],
          lastSentAt: '',
        },
        alertaOperacionalEmailState: atual.alertaOperacionalEmailState ?? {
          lastNotifiedFingerprint: '',
          lastSentAt: '',
        },
      };
      return {
        baselineUpdatedAt,
        nextPayload: {
          ...payload,
          configuracoesSistema: nextConfig,
          dataAtualizacao: new Date().toISOString(),
        },
      };
    });
    return { success: true, data: { sincronizado: true } };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao sincronizar alerta de estoque na nuvem.',
    };
  }
}
