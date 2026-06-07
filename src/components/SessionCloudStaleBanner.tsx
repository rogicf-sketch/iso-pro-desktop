import { OperationalNotice } from './ui/OperationalNotice';
import { useSessionCloudValidationStale } from '../lib/sessionCloudHealth';
import { hasSupabaseConfig } from '../lib/supabase';
import { isIsoProDesktop } from '../lib/pdfCloud/pdfCloudConfig';

export function SessionCloudStaleBanner() {
  const stale = useSessionCloudValidationStale();
  /** Desktop com snapshot local: aviso de nuvem não bloqueia operação (ex.: PDF RIR local). */
  if (!hasSupabaseConfig() || !stale || isIsoProDesktop()) {
    return null;
  }
  return (
    <OperationalNotice tone="warning">
      Ligacao à nuvem indisponivel ou sessao nao revalidada. Os dados podem estar desatualizados; evite
      operacoes criticas ate restabelecer a ligacao.
    </OperationalNotice>
  );
}
