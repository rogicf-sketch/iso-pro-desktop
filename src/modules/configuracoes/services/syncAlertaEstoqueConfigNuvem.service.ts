import { commitIsoProSnapshotPatch, readIsoProSnapshotSlicesForWrite } from '../../../lib/isoProSnapshot';
import { hasSupabaseConfig } from '../../../lib/supabase';
import type { ServiceResult } from '../../../types/common.types';
import type { ConfiguracaoSistema } from '../types/configuracao.types';
import {
  extrairConfigAlertaEstoqueParaSnapshot,
  lerConfigAlertaEstoqueDoSnapshot,
} from '../utils/configAlertaEstoqueSnapshot';
import {
  extrairConfigReciboMobileParaSnapshot,
  normalizarLogoInstitucionalParaSnapshotMobile,
} from '../utils/configReciboMobileSnapshot';

/**
 * Copia configuracao de alerta de estoque (SMTP + destinatarios) e recibo mobile (logo, CNPJ, projeto)
 * para `configuracoesSistema` no snapshot na nuvem.
 * Preserva `alertaEstoqueEmailState` gerido pela Edge Function.
 */
export async function sincronizarConfigAlertaEstoqueParaNuvem(
  config: ConfiguracaoSistema,
): Promise<ServiceResult<{ sincronizado: boolean }>> {
  if (!hasSupabaseConfig()) {
    return { success: true, data: { sincronizado: false } };
  }

  try {
    await commitIsoProSnapshotPatch(async () => {
      const { slices, baselineUpdatedAt } = await readIsoProSnapshotSlicesForWrite(['configuracoesSistema']);
      const payload = slices;
      const atual = lerConfigAlertaEstoqueDoSnapshot(payload.configuracoesSistema);
      const parcialAlerta = extrairConfigAlertaEstoqueParaSnapshot(config);
      const logoMobile = await normalizarLogoInstitucionalParaSnapshotMobile(config.logoInstitucionalUrl);
      const parcialRecibo = extrairConfigReciboMobileParaSnapshot(config, logoMobile);
      const nextConfig = {
        ...(payload.configuracoesSistema && typeof payload.configuracoesSistema === 'object'
          ? (payload.configuracoesSistema as Record<string, unknown>)
          : {}),
        ...parcialAlerta,
        ...parcialRecibo,
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
        patch: {
          configuracoesSistema: nextConfig,
          dataAtualizacao: new Date().toISOString(),
        },
      };
    });
    return { success: true, data: { sincronizado: true } };
  } catch (e) {
    return {
      success: false,
      error:
        e instanceof Error ?
          e.message
        : 'Falha ao sincronizar configuracoes na nuvem (logo/CNPJ do recibo mobile, alertas e projeto).',
    };
  }
}
