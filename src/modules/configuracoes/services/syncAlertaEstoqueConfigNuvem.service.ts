import { writeConfiguracoesSotOnCloud } from '../../../lib/configuracoesTabelas';
import { IsoProSnapshotConflictError, readIsoProSnapshotSlicesForWrite } from '../../../lib/isoProSnapshot';
import { assertNoSilentSotFallback } from '../../../lib/sotWriteGuard';
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
import { extrairConfigOperacionalParaSnapshot } from '../utils/configOperacionalSnapshot';
import { readMateriaisDominiosListas } from '../../materiais/services/materiaisDominios.storage';

/**
 * Copia configuracao operacional para configuracoesSistema via SoT
 * (iso_pro_write_configuracoes_sot). Preserva estados de email da Edge.
 */
export async function sincronizarConfigAlertaEstoqueParaNuvem(
  config: ConfiguracaoSistema,
  opts?: { atualizadoEm?: string },
): Promise<ServiceResult<{ sincronizado: boolean }>> {
  if (!hasSupabaseConfig()) {
    return { success: true, data: { sincronizado: false } };
  }

  const atualizadoEm = opts?.atualizadoEm ?? new Date().toISOString();

  try {
    const { slices, baselineUpdatedAt } = await readIsoProSnapshotSlicesForWrite([
      'configuracoesSistema',
      'disciplinas',
      'unidades',
    ]);
    const payload = slices;
    const atual = lerConfigAlertaEstoqueDoSnapshot(payload.configuracoesSistema);
    const parcialAlerta = extrairConfigAlertaEstoqueParaSnapshot(config);
    const logoMobile = await normalizarLogoInstitucionalParaSnapshotMobile(config.logoInstitucionalUrl);
    const parcialRecibo = extrairConfigReciboMobileParaSnapshot(config, logoMobile);
    const dominios = readMateriaisDominiosListas();
    const parcialOperacional = extrairConfigOperacionalParaSnapshot(config, {
      atualizadoEm,
      materiaisDominios: {
        disciplinas: dominios.disciplinas,
        unidades: dominios.unidades,
        unidadeDescricoes: dominios.unidadeDescricoes,
      },
    });
    const nextConfig = {
      ...(payload.configuracoesSistema && typeof payload.configuracoesSistema === 'object'
        ? (payload.configuracoesSistema as Record<string, unknown>)
        : {}),
      ...parcialAlerta,
      ...parcialRecibo,
      ...parcialOperacional,
      alertaEstoqueEmailState: atual.alertaEstoqueEmailState ?? {
        lastNotifiedCriticalIds: [],
        lastSentAt: '',
      },
      alertaOperacionalEmailState: atual.alertaOperacionalEmailState ?? {
        lastNotifiedFingerprint: '',
        lastSentAt: '',
      },
    };

    const written = await writeConfiguracoesSotOnCloud({
      baselineUpdatedAt,
      configuracoes: nextConfig,
      disciplinas: dominios.disciplinas,
      unidades: dominios.unidades,
    });
    assertNoSilentSotFallback('configuracoes', written.missing);
    return { success: true, data: { sincronizado: !written.missing } };
  } catch (e) {
    if (e instanceof IsoProSnapshotConflictError) {
      return {
        success: false,
        error:
          'Conflito na nuvem ao gravar configuracoes. Actualize e grave de novo (outro posto alterou ao mesmo tempo).',
      };
    }
    return {
      success: false,
      error:
        e instanceof Error
          ? e.message
          : 'Falha ao sincronizar configuracoes na nuvem (EXE e web devem partilhar a mesma fonte).',
    };
  }
}