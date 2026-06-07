import { abrirPreVisualizacaoHtmlRelatorio } from '../htmlRelatorioInstitucional';
import { traduzirErroImpressaoIsoPro } from '../traduzirErroImpressaoIsoPro';

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



  const api = typeof window !== 'undefined' ? window.isoProDesktop : undefined;



  if (api?.printHtml) {
    const res = await api.printHtml(html);
    if (res.ok) return true;
    console.warn('[I.S.O PRO] printHtml falhou:', res.error);
    /** Desktop: evitar fallback lento (gerar PDF + carregar ficheiro) — falha rápida e clara. */
    return false;
  }

  try {
    const gerado = await gerarHtmlRelatorioPdfBytes(tipo, html, fileName);
    const entrega = await entregarPdfBytes(gerado.bytes, gerado.fileName, 'imprimir');
    if (entrega.ok) return true;
  } catch (e) {
    console.warn('[I.S.O PRO] Imprimir PDF bytes falhou:', e);
  }

  const prev = await abrirPreVisualizacaoHtmlRelatorio(html);
  return prev.ok;



}







export async function guardarHtmlRelatorioHibrido(
  tipo: HtmlTipo,
  html: string,
  fileName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const api = typeof window !== 'undefined' ? window.isoProDesktop : undefined;

  if (api?.saveHtmlAsPdf) {
    const res = await api.saveHtmlAsPdf(html);
    if (res.ok) return res;
    console.warn('[I.S.O PRO] saveHtmlAsPdf falhou, tentando PDF bytes:', res.error);
  }

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
  _tipo: HtmlTipo,
  html: string,
  _fileName: string,
  titulo: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  /** Desktop: janela HTML dedicada (lista principal visível). Web: overlay in-app. */

  const htmlPreview = await abrirPreVisualizacaoHtmlRelatorio(html, { tituloCarregamento: titulo });

  if (htmlPreview.ok) return htmlPreview;

  return {
    ok: false,
    error: traduzirErroImpressaoIsoPro(
      htmlPreview.error ?? 'Não foi possível abrir a pré-visualização. Use «Imprimir / PDF».',
    ),
  };

}


