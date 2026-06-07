import { readConfiguracoes } from '../../modules/configuracoes/services/configuracoes.service';

import { hasSupabaseConfig } from '../supabase';



/** Ambiente Electron desktop (IPC disponível). */

export function isIsoProDesktop(): boolean {

  return typeof window !== 'undefined' && window.isoProDesktop?.platform === 'desktop';

}



/** PDF na nuvem activo quando Supabase configurado e opção ligada. */

export function pdfNuvemHabilitado(): boolean {

  if (!hasSupabaseConfig()) return false;

  try {

    const cfg = readConfiguracoes();

    return cfg.pdfNuvemHabilitado !== false;

  } catch {

    return false;

  }

}



/**

 * Usar worker remoto para PDF. Em `npm run dev` força local para ver alterações imediatas.

 * No browser: `localStorage.setItem('iso-pro-forcar-pdf-local','1')` + recarregar.

 */

export function pdfNuvemAtivo(): boolean {

  if (import.meta.env.DEV) return false;

  if (typeof localStorage !== 'undefined' && localStorage.getItem('iso-pro-forcar-pdf-local') === '1') {

    return false;

  }

  return pdfNuvemHabilitado();

}



export function pdfNuvemTimeoutMs(): number {

  try {

    const cfg = readConfiguracoes();

    const n = Number(cfg.pdfNuvemTimeoutSegundos);

    if (Number.isFinite(n) && n >= 15 && n <= 300) return n * 1000;

  } catch {

    /* ignore */

  }

  return 90_000;

}

