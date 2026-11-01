import { APP_VERSION } from '@/appMeta';
import {
  FORCE_UPDATE_BELOW_VERSION,
  getAppUpdatePolicy,
  MIN_SUPPORTED_APP_VERSION,
} from '../lib/appVersionPolicy';
import { isFeatureEnabled } from '../lib/isoProFeatureFlags';
import { OperationalNotice } from './ui/OperationalNotice';

export function AppVersionOutdatedBanner() {
  const policy = getAppUpdatePolicy(APP_VERSION);
  if (!policy.belowMinimum && !policy.forceUpdate) {
    return null;
  }

  const force = policy.forceUpdate && isFeatureEnabled('force_update_gate');

  if (force) {
    return (
      <OperationalNotice tone="critical">
        Actualizacao obrigatoria: esta instalacao (v{APP_VERSION}) esta abaixo de{' '}
        {FORCE_UPDATE_BELOW_VERSION}. Gravacoes de negocio estao bloqueadas ate instalar o Setup/portable
        assinado (SHA256SUMS). Rollback: guarde o EXE anterior em release/versoes-anteriores.
      </OperationalNotice>
    );
  }

  if (!policy.belowMinimum) return null;

  return (
    <OperationalNotice tone="critical">
      Esta instalacao (v{APP_VERSION}) esta desatualizada. A versao minima suportada e{' '}
      {MIN_SUPPORTED_APP_VERSION}. Actualize o I.S.O PRO Desktop antes de operacoes criticas.
    </OperationalNotice>
  );
}
