import type { ReactNode } from 'react';
import { OperationalNotice } from './OperationalNotice';

type Props = {
  /** true = lista a vir da nuvem sem problema */
  healthy: boolean;
  /** Texto só quando NÃO healthy (fallback / config incompleta). */
  fallbackMessage: ReactNode;
  /** Aviso opcional mesmo com nuvem ok (ex.: materiaisNuvem off). */
  healthyWarning?: ReactNode;
};

/**
 * Evita a faixa larga «Fonte atual: Supabase…» quando a topbar já mostra a meta.
 * Só ocupa espaço se houver problema ou aviso operacional.
 */
export function FonteDadosNotice({ healthy, fallbackMessage, healthyWarning }: Props) {
  if (healthy) {
    if (!healthyWarning) return null;
    return <OperationalNotice tone="warning">{healthyWarning}</OperationalNotice>;
  }
  return <OperationalNotice tone="warning">{fallbackMessage}</OperationalNotice>;
}
