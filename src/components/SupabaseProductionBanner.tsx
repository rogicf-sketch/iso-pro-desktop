import { useCallback, useEffect, useState } from 'react';
import { ISO_PRO_CONFIG_UPDATED_EVENT } from '@/lib/configEvents';
import { hasSupabaseConfig } from '@/lib/supabase';
import { OperationalNotice } from '@/components/ui/OperationalNotice';

/**
 * Aviso persistente em build de producao quando Supabase nao esta configurado,
 * para evitar trabalhar em modo apenas local sem perceber.
 */
export function SupabaseProductionBanner() {
  const [cloudOk, setCloudOk] = useState(() => (import.meta.env.DEV ? true : hasSupabaseConfig()));

  const sync = useCallback(() => {
    if (import.meta.env.DEV) {
      setCloudOk(true);
      return;
    }
    setCloudOk(hasSupabaseConfig());
  }, []);

  useEffect(() => {
    window.addEventListener('focus', sync);
    window.addEventListener(ISO_PRO_CONFIG_UPDATED_EVENT, sync);
    return () => {
      window.removeEventListener('focus', sync);
      window.removeEventListener(ISO_PRO_CONFIG_UPDATED_EVENT, sync);
    };
  }, [sync]);

  if (import.meta.env.DEV || cloudOk) {
    return null;
  }

  return (
    <OperationalNotice tone="critical">
      <strong>Supabase nao configurado (producao).</strong> Os dados de negocio nao serao gravados no servidor ate preencher URL e chave em{' '}
      <strong>Configuracoes &gt; Integracao Supabase e nuvem</strong> e guardar. Configure antes de lançar operacoes.
    </OperationalNotice>
  );
}
