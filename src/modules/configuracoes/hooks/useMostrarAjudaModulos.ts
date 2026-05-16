import { useEffect, useState } from 'react';
import { ISO_PRO_CONFIG_UPDATED_EVENT } from '@/lib/configEvents';
import { readConfiguracoes } from '../services/configuracoes.service';

export function useMostrarAjudaModulos(): boolean {
  const [mostrar, setMostrar] = useState(() => readConfiguracoes().mostrarAjudaModulos !== false);

  useEffect(() => {
    const handler = () => setMostrar(readConfiguracoes().mostrarAjudaModulos !== false);
    window.addEventListener(ISO_PRO_CONFIG_UPDATED_EVENT, handler);
    return () => window.removeEventListener(ISO_PRO_CONFIG_UPDATED_EVENT, handler);
  }, []);

  return mostrar;
}
