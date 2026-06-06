import { abrirPreVisualizacaoHtmlRelatorio } from '../htmlRelatorioInstitucional';

import { entregarPdfBytes, gerarHtmlRelatorioPdfBytes } from './pdfHybridRouter';

import type { PdfJobTipo } from './types';



type HtmlTipo = PdfJobTipo;



async function fallbackGuardarHtml(html: string): Promise<{ ok: true } | { ok: false; error: string }> {

  const api = typeof window !== 'undefined' ? window.isoProDesktop : undefined;

  if (api?.saveHtmlAsPdf) {

    return api.saveHtmlAsPdf(html);

  }

  return { ok: false, error: 'Guardar PDF indisponível neste ambiente.' };

}



export async function imprimirHtmlRelatorioHibrido(

  tipo: HtmlTipo,

  html: string,

  fileName: string,

): Promise<boolean> {

  const prev = await preVisualizarHtmlRelatorioHibrido(tipo, html, fileName, fileName);

  return prev.ok;

}



export async function guardarHtmlRelatorioHibrido(

  tipo: HtmlTipo,

  html: string,

  fileName: string,

): Promise<{ ok: true } | { ok: false; error: string }> {

  try {

    const gerado = await gerarHtmlRelatorioPdfBytes(tipo, html, fileName);

    const entrega = await entregarPdfBytes(gerado.bytes, gerado.fileName, 'guardar');

    if (entrega.ok) return entrega;

  } catch (e) {

    console.warn('[I.S.O PRO] Guardar PDF bytes, fallback HTML:', e);

  }

  return fallbackGuardarHtml(html);

}



export async function preVisualizarHtmlRelatorioHibrido(

  tipo: HtmlTipo,

  html: string,

  fileName: string,

  titulo: string,

): Promise<{ ok: true } | { ok: false; error: string }> {

  const api = typeof window !== 'undefined' ? window.isoProDesktop : undefined;

  if (api?.previewReportPdfFromHtml) {

    try {

      const direto = await api.previewReportPdfFromHtml(html, titulo, fileName);

      if (direto.ok) return direto;

      console.warn('[I.S.O PRO] Preview PDF direto falhou:', direto.error);

    } catch (e) {

      console.warn('[I.S.O PRO] Preview PDF direto (IPC) falhou:', e);

    }

  }

  try {

    const gerado = await gerarHtmlRelatorioPdfBytes(tipo, html, fileName);

    const entrega = await entregarPdfBytes(gerado.bytes, gerado.fileName, 'preview', titulo);

    if (entrega.ok) return entrega;

  } catch (e) {

    console.warn('[I.S.O PRO] Preview PDF bytes, fallback HTML:', e);

  }

  return abrirPreVisualizacaoHtmlRelatorio(html);

}

