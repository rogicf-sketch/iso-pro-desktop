import { pdfNuvemAtivo, pdfNuvemHabilitado, pdfNuvemTimeoutMs, isIsoProDesktop } from './pdfCloudConfig';

import { gerarPdfViaNuvem } from './pdfCloudClient';

import type { PdfGerado, PdfJobTipo } from './types';

import {

  rirPdfBase64ParaBytes,

  rirPdfBytesParaBase64,

} from '../../modules/qualidade/pdf/rirPdfService';



export function estaOnline(): boolean {

  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;

  return true;

}



export type PdfHibridoOpcoes = {

  tipo: PdfJobTipo;

  payload: unknown;

  fileName: string;

  gerarLocal: () => Promise<{ bytes: Uint8Array; fileName: string }>;

};



/** Tenta nuvem quando online + configurado; senão fallback local. */

export async function gerarPdfHibrido(opts: PdfHibridoOpcoes): Promise<PdfGerado> {

  /** RIR: HTML + Chromium (Playwright na nuvem, printToPDF no desktop). */
  if (estaOnline() && pdfNuvemAtivo()) {

    try {

      const nuvem = await gerarPdfViaNuvem(opts.tipo, opts.payload, opts.fileName, pdfNuvemTimeoutMs());

      return { ...nuvem, origem: 'nuvem' };

    } catch (e) {

      console.warn('[I.S.O PRO] PDF nuvem indisponível, fallback local:', e);

    }

  } else if (import.meta.env.DEV && pdfNuvemHabilitado()) {

    console.info('[I.S.O PRO] PDF local (dev): motor do código-fonte, não o worker remoto.');

  }

  const local = await opts.gerarLocal();

  return { ...local, origem: 'local' };

}



export type HtmlPdfTipo = PdfJobTipo;



export function electronTemGeradorPdfBytes(): boolean {

  return Boolean(typeof window !== 'undefined' && window.isoProDesktop?.gerarPdfBytesFromHtml);

}



/** Gera bytes PDF a partir de HTML no processo principal (Electron). */

export async function gerarPdfBytesFromHtmlLocal(html: string): Promise<Uint8Array> {

  const api = typeof window !== 'undefined' ? window.isoProDesktop : undefined;

  if (api?.gerarPdfBytesFromHtml) {

    const res = await api.gerarPdfBytesFromHtml(html);

    if (!res.ok) throw new Error(res.error ?? 'Falha ao gerar PDF local.');

    if (!res.base64) throw new Error('PDF gerado sem conteúdo.');

    return rirPdfBase64ParaBytes(res.base64);

  }

  if (isIsoProDesktop()) {

    throw new Error(

      'Atualize o I.S.O PRO Desktop para a versão mais recente (motor PDF). Reinicie a aplicação após instalar.',

    );

  }

  throw new Error(

    'PDF local indisponível neste ambiente. Ative «PDF na nuvem» em Configurações ou use o I.S.O PRO Desktop.',

  );

}



/**

 * Relatórios HTML: nuvem (Playwright) ou bytes locais (Chromium printToPDF).

 * Sempre retorna bytes — artefato canônico antes de preview/impressão.

 */

export async function gerarHtmlRelatorioPdfBytes(

  tipo: HtmlPdfTipo,

  html: string,

  fileName: string,

): Promise<PdfGerado> {

  let erroNuvem: string | null = null;

  /** Desktop: Chromium local primeiro (não depende de sessão Supabase). */
  if (electronTemGeradorPdfBytes()) {

    try {

      const bytes = await gerarPdfBytesFromHtmlLocal(html);

      return { bytes, fileName, origem: 'local' };

    } catch (e) {

      const msgLocal = e instanceof Error ? e.message : String(e);

      console.warn('[I.S.O PRO] PDF local falhou, tentando nuvem:', msgLocal);

      erroNuvem = msgLocal;

    }

  }



  /** RIR no desktop: não tentar nuvem após falha local (evita mensagem confusa de sessão Supabase). */
  if (tipo === 'rir' && isIsoProDesktop() && erroNuvem) {
    throw new Error(erroNuvem);
  }

  if (estaOnline() && pdfNuvemAtivo()) {

    try {

      const waitPagedJs = tipo !== 'rir';

      const nuvem = await gerarPdfViaNuvem(

        tipo,

        { html, waitPagedJs },

        fileName,

        pdfNuvemTimeoutMs(),

      );

      return { ...nuvem, origem: 'nuvem' };

    } catch (e) {

      const msg = e instanceof Error ? e.message : String(e);

      console.warn('[I.S.O PRO] HTML PDF nuvem indisponível:', msg);

      if (erroNuvem) {

        throw new Error(`Local: ${erroNuvem} · Nuvem: ${msg}`);

      }

      throw e instanceof Error ? e : new Error(msg);

    }

  } else if (import.meta.env.DEV && pdfNuvemHabilitado()) {

    console.info('[I.S.O PRO] PDF local (dev): motor do código-fonte, não o worker remoto.');

  }



  if (isIsoProDesktop()) {

    throw new Error(

      erroNuvem ??

        'Motor PDF local indisponível. Reinicie o I.S.O PRO Desktop (versão 0.1.30+).',

    );

  }



  if (erroNuvem) {

    throw new Error(erroNuvem);

  }

  if (!pdfNuvemHabilitado()) {

    throw new Error('Ative «PDF na nuvem» em Configurações (requer Supabase e worker activo).');

  }

  throw new Error('Sem ligação ou Supabase indisponível para gerar PDF.');

}



export type EntregarPdfModo = 'generico' | 'rir';



/** Guarda/imprime/preview PDF bytes via APIs desktop ou download web. */

export async function entregarPdfBytes(

  bytes: Uint8Array,

  fileName: string,

  acao: 'guardar' | 'imprimir' | 'preview',

  tituloPreview?: string,

  opts?: { modo?: EntregarPdfModo },

): Promise<{ ok: true } | { ok: false; error: string }> {

  const base64 = rirPdfBytesParaBase64(bytes);

  const modo = opts?.modo ?? 'generico';

  const api = typeof window !== 'undefined' ? window.isoProDesktop : undefined;



  if (acao === 'guardar') {

    if (modo === 'rir' && api?.saveRirPdf) {

      const res = await api.saveRirPdf(base64, fileName);

      return res.ok ? { ok: true } : { ok: false, error: res.error ?? 'Falha ao guardar.' };

    }

    if (api?.saveReportPdf) {

      const res = await api.saveReportPdf(base64, fileName);

      return res.ok ? { ok: true } : { ok: false, error: res.error ?? 'Falha ao guardar.' };

    }

    const blob = new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' });

    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');

    a.href = url;

    a.download = fileName;

    a.click();

    URL.revokeObjectURL(url);

    return { ok: true };

  }



  if (acao === 'imprimir') {

    if (modo === 'rir' && api?.printRirPdf) {

      const res = await api.printRirPdf(base64);

      return res.ok ? { ok: true } : { ok: false, error: res.error ?? 'Falha na impressão.' };

    }

    if (api?.printReportPdf) {

      const res = await api.printReportPdf(base64);

      return res.ok ? { ok: true } : { ok: false, error: res.error ?? 'Falha na impressão.' };

    }

    return entregarPdfBytes(bytes, fileName, 'guardar', tituloPreview, opts);

  }



  if (modo === 'rir' && api?.previewRirPdf) {

    const res = await api.previewRirPdf(base64, tituloPreview ?? fileName, fileName);

    return res.ok ? { ok: true } : { ok: false, error: res.error ?? 'Falha na pré-visualização.' };

  }

  if (api?.previewReportPdf) {

    const res = await api.previewReportPdf(base64, tituloPreview ?? fileName, fileName);

    return res.ok ? { ok: true } : { ok: false, error: res.error ?? 'Falha na pré-visualização.' };

  }



  const blob = new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' });

  const url = URL.createObjectURL(blob);

  window.open(url, '_blank', 'noopener,noreferrer');

  setTimeout(() => URL.revokeObjectURL(url), 120_000);

  return { ok: true };

}

