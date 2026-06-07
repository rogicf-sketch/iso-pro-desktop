import type { RirRegistro } from '../types/qualidade.types';
import { montarHtmlRelatorioRirParaPdf } from './imprimirRirHtml';
import { abrirPreVisualizacaoHtmlRelatorio } from '../../../lib/htmlRelatorioInstitucional';
import {
  entregarPdfBytes,
  gerarHtmlRelatorioPdfBytes,
} from '../../../lib/pdfCloud/pdfHybridRouter';
import { rirPdfBytesParaBase64 } from '../pdf/rirPdfService';

/** Motor oficial RIR: HTML institucional + Chromium (Playwright / printToPDF). */
export const RIR_PDF_MOTOR = 'html-chromium' as const;

export type RirPdfResult = { ok: true; detalhe?: string } | { ok: false; error: string };

function nomeArquivoRir(registro: RirRegistro): string {
  return `RIR-${(registro.codigo || 'documento').replace(/[^\w.-]+/g, '_')}.pdf`;
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

export async function salvarRirRelatorioPdf(registro: RirRegistro): Promise<RirPdfResult> {
  const gerado = await gerarRirPdfOficialValidado(registro);
  if (!gerado.ok) return gerado;

  if (typeof window !== 'undefined' && window.isoProDesktop?.saveRirPdf) {
    const res = await window.isoProDesktop.saveRirPdf(gerado.base64, gerado.fileName);
    return res.ok ? { ok: true } : { ok: false, error: res.error ?? 'Falha ao guardar PDF.' };
  }

  const blob = new Blob([Uint8Array.from(gerado.bytes)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = gerado.fileName;
  a.click();
  URL.revokeObjectURL(url);
  return { ok: true };
}

export async function imprimirRirRelatorioPdf(registro: RirRegistro): Promise<RirPdfResult> {
  const gerado = await gerarRirPdfOficialValidado(registro);
  if (!gerado.ok) return gerado;

  if (window.isoProDesktop?.printRirPdf) {
    const res = await window.isoProDesktop.printRirPdf(gerado.base64);
    return res.ok ? { ok: true } : { ok: false, error: res.error ?? 'Falha na impressão.' };
  }

  return salvarRirRelatorioPdf(registro);
}

export async function preVisualizarRirRelatorio(registro: RirRegistro): Promise<RirPdfResult> {
  try {
    const titulo = `Pré-visualização — RIR ${(registro.codigo || '').trim() || 'documento'}`;
    const fileName = nomeArquivoRir(registro);
    const html = montarHtmlRelatorioRirParaPdf(registro);
    const api = window.isoProDesktop;

    const inApp = await abrirPreVisualizacaoHtmlRelatorio(html);
    if (inApp.ok) {
      return { ok: true, detalhe: `Pré-visualização no ecrã · ${RIR_PDF_MOTOR}` };
    }

    if (api?.previewRirPdfFromHtml) {
      const res = await api.previewRirPdfFromHtml(html, titulo, fileName);
      if (res.ok) return { ok: true, detalhe: `PDF local · ${RIR_PDF_MOTOR}` };
      return { ok: false, error: res.error ?? 'Falha na pré-visualização.' };
    }

    const gerado = await gerarRirPdfOficialValidado(registro);
    if (!gerado.ok) return gerado;

    const detalhe = `PDF ${gerado.origem} · ${RIR_PDF_MOTOR} · ${Math.round(gerado.bytes.length / 1024)} KB`;
    console.info(`[I.S.O PRO RIR] ${detalhe}`);

    if (api?.previewRirPdf) {
      const res = await api.previewRirPdf(gerado.base64, titulo, gerado.fileName);
      if (res.ok) return { ok: true, detalhe };
      return { ok: false, error: res.error ?? 'Falha na pré-visualização.' };
    }

    const entrega = await entregarPdfBytes(gerado.bytes, gerado.fileName, 'preview', titulo, {
      modo: 'rir',
    });
    return entrega.ok ? { ok: true, detalhe } : entrega;
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
