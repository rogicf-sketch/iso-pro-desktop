import type { RirRegistro } from '../types/qualidade.types';

import { traduzirErroImpressaoIsoPro } from '../../../lib/traduzirErroImpressaoIsoPro';
import { montarDocumentoHtmlImpressaoRir, montarHtmlRelatorioRirParaPdf } from './imprimirRirHtml';

import {
  abrirImpressaoHtmlNavegador,
  abrirPreVisualizacaoHtmlRelatorio,
} from '../../../lib/htmlRelatorioInstitucional';
import { isElectronApp } from '../../../lib/isElectronApp';

import { gerarHtmlRelatorioPdfBytes } from '../../../lib/pdfCloud/pdfHybridRouter';

import { rirPdfBytesParaBase64 } from '../pdf/rirPdfService';



/** Motor oficial RIR: HTML institucional + Chromium (Playwright / printToPDF). */

export const RIR_PDF_MOTOR = 'html-chromium' as const;



export type RirPdfResult = { ok: true; detalhe?: string } | { ok: false; error: string };



function nomeArquivoRir(registro: RirRegistro): string {

  return `RIR-${(registro.codigo || 'documento').replace(/[^\w.-]+/g, '_')}.pdf`;

}



function tituloRir(registro: RirRegistro): string {

  return `Pré-visualização — RIR ${(registro.codigo || '').trim() || 'documento'}`;

}



function validarPdfBasico(bytes: Uint8Array): { ok: true } | { ok: false; error: string } {

  if (bytes.length < 64) return { ok: false, error: 'PDF vazio ou incompleto.' };

  const head = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!, bytes[4]!);

  if (head !== '%PDF-') return { ok: false, error: 'Arquivo não é um PDF válido.' };

  return { ok: true };

}



async function gerarBytesRir(

  registro: RirRegistro,

): Promise<{ bytes: Uint8Array; origem: 'local' | 'nuvem'; fileName: string }> {

  const html = montarHtmlRelatorioRirParaPdf(registro);

  const fileName = nomeArquivoRir(registro);

  const gerado = await gerarHtmlRelatorioPdfBytes('rir', html, fileName);

  return { bytes: gerado.bytes, origem: gerado.origem ?? 'local', fileName: gerado.fileName };

}



/** Gera PDF RIR via engine HTML/Chromium (nuvem Playwright ou Electron local). */

export async function gerarRirPdfOficialValidado(

  registro: RirRegistro,

): Promise<

  | { ok: true; bytes: Uint8Array; base64: string; fileName: string; origem: 'local' | 'nuvem' }

  | { ok: false; error: string }

> {

  try {

    const { bytes, origem, fileName } = await gerarBytesRir(registro);

    const validacao = validarPdfBasico(bytes);

    if (!validacao.ok) return validacao;

    return {

      ok: true,

      bytes,

      base64: rirPdfBytesParaBase64(bytes),

      fileName,

      origem,

    };

  } catch (e) {

    const msg = e instanceof Error ? e.message : String(e);

    return { ok: false, error: msg };

  }

}



/** Impressão rápida via HTML no desktop (sem gerar PDF intermédio). */
export async function imprimirRirRelatorioPdf(
  registro: RirRegistro,
  opts?: { printWindow?: Window | null },
): Promise<RirPdfResult> {
  const html = montarDocumentoHtmlImpressaoRir(registro);
  const api = typeof window !== 'undefined' ? window.isoProDesktop : undefined;

  if (api?.printHtml) {
    const res = await api.printHtml(html);
    if (res.ok) return { ok: true, detalhe: `Impressão HTML · ${RIR_PDF_MOTOR}` };
    return {
      ok: false,
      error: traduzirErroImpressaoIsoPro(res.error ?? 'Falha na impressão.'),
    };
  }

  /** Web: popup reservado no clique + diálogo de impressão do navegador. */
  if (!isElectronApp()) {
    if (abrirImpressaoHtmlNavegador(html, opts?.printWindow)) {
      return { ok: true, detalhe: 'Impressão HTML (navegador)' };
    }
    return {
      ok: false,
      error: traduzirErroImpressaoIsoPro(
        'Não foi possível abrir a impressão. Permita pop-ups para este site ou use «Visualizar» e depois «Imprimir / PDF».',
      ),
    };
  }

  const gerado = await gerarRirPdfOficialValidado(registro);
  if (!gerado.ok) return gerado;

  if (api?.printRirPdf) {
    const res = await api.printRirPdf(gerado.base64);
    return res.ok
      ? { ok: true }
      : { ok: false, error: traduzirErroImpressaoIsoPro(res.error ?? 'Falha na impressão.') };
  }

  return salvarRirRelatorioPdf(registro);
}



/** Guardar PDF via HTML no desktop; fallback para bytes PDF. */

export async function salvarRirRelatorioPdf(registro: RirRegistro): Promise<RirPdfResult> {

  const html = montarHtmlRelatorioRirParaPdf(registro);

  const fileName = nomeArquivoRir(registro);

  const api = typeof window !== 'undefined' ? window.isoProDesktop : undefined;



  if (api?.saveHtmlAsPdf) {

    const res = await api.saveHtmlAsPdf(html);

    if (res.ok) return { ok: true, detalhe: `PDF HTML · ${RIR_PDF_MOTOR}` };

    console.warn('[I.S.O PRO RIR] saveHtmlAsPdf falhou, fallback PDF bytes:', res.error);

  }



  const gerado = await gerarRirPdfOficialValidado(registro);

  if (!gerado.ok) return gerado;



  if (api?.saveRirPdf) {

    const res = await api.saveRirPdf(gerado.base64, gerado.fileName);

    return res.ok ? { ok: true } : { ok: false, error: res.error ?? 'Falha ao guardar PDF.' };

  }



  const blob = new Blob([Uint8Array.from(gerado.bytes)], { type: 'application/pdf' });

  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');

  a.href = url;

  a.download = fileName;

  a.click();

  URL.revokeObjectURL(url);

  return { ok: true };

}



export async function preVisualizarRirRelatorio(registro: RirRegistro): Promise<RirPdfResult> {

  try {

    const titulo = tituloRir(registro);

    const html = montarDocumentoHtmlImpressaoRir(registro);

    const htmlPreview = await abrirPreVisualizacaoHtmlRelatorio(html, {
      tituloCarregamento: titulo,
      pdfFileName: nomeArquivoRir(registro),
      pdfTipo: 'rir',
    });

    if (htmlPreview.ok) {
      return { ok: true, detalhe: `Pré-visualização HTML · ${RIR_PDF_MOTOR}` };
    }

    return {
      ok: false,
      error: traduzirErroImpressaoIsoPro(htmlPreview.error ?? 'Falha na pré-visualização.'),
    };

  } catch (e) {

    const msg = e instanceof Error ? e.message : String(e);

    return { ok: false, error: msg };

  }

}



/** @deprecated Use imprimirRirRelatorioPdf. */

export function imprimirRirHtml(registro: RirRegistro): boolean {

  void imprimirRirRelatorioPdf(registro);

  return true;

}



export { montarDocumentoHtmlImpressaoRir, montarHtmlRelatorioRirCompleto, montarHtmlRelatorioRirParaPdf } from './imprimirRirHtml';


