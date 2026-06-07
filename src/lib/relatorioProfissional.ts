/**
 * API unificada: imprimir, guardar e pré-visualizar relatórios com qualidade institucional.
 * Desktop: HTML → IPC (printHtml / saveHtmlAsPdf / previewHtml) — rápido e fiável.
 * Web / fallback: bytes PDF ou overlay HTML.
 */
import { abrirPreVisualizacaoHtmlRelatorio } from './htmlRelatorioInstitucional';
import { traduzirErroImpressaoIsoPro } from './traduzirErroImpressaoIsoPro';
import { entregarPdfBytes, gerarHtmlRelatorioPdfBytes, gerarPdfBytesFromHtmlLocal } from './pdfCloud/pdfHybridRouter';
import type { PdfJobTipo } from './pdfCloud/types';

export type HtmlRelatorioNuvemTipo = PdfJobTipo;

export type RelatorioProfissionalOpts = {
  html: string;
  fileName: string;
  titulo?: string;
  /** Tipo na fila Supabase + auditoria. Recomendado em todos os relatórios. */
  tipoNuvem?: HtmlRelatorioNuvemTipo;
};

export function nomeArquivoRelatorioPdf(codigo: string, prefixo: string): string {
  const slug = (codigo || 'documento').replace(/[^\w.-]+/g, '_');
  return `${prefixo}-${slug}.pdf`;
}

async function entregarHtmlPdfLocal(
  html: string,
  fileName: string,
  acao: 'guardar' | 'imprimir' | 'preview',
  titulo?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const api = typeof window !== 'undefined' ? window.isoProDesktop : undefined;
  const tituloStr = titulo ?? fileName;

  if (acao === 'imprimir' && api?.printHtml) {
    const res = await api.printHtml(html);
    if (res.ok) return res;
    return { ok: false, error: traduzirErroImpressaoIsoPro(res.error ?? 'Falha na impressão.') };
  }

  if (acao === 'guardar' && api?.saveHtmlAsPdf) {
    const res = await api.saveHtmlAsPdf(html);
    if (res.ok) return res;
    try {
      const bytes = await gerarPdfBytesFromHtmlLocal(html);
      return entregarPdfBytes(bytes, fileName, 'guardar', tituloStr);
    } catch {
      return { ok: false, error: traduzirErroImpressaoIsoPro(res.error ?? 'Falha ao guardar PDF.') };
    }
  }

  if (acao === 'preview') {
    const prev = await abrirPreVisualizacaoHtmlRelatorio(html, { tituloCarregamento: tituloStr });
    if (prev.ok) return prev;
    return { ok: false, error: traduzirErroImpressaoIsoPro(prev.error ?? 'Falha na pré-visualização.') };
  }

  try {
    const bytes = await gerarPdfBytesFromHtmlLocal(html);
    return entregarPdfBytes(bytes, fileName, acao, tituloStr);
  } catch (e) {
    console.warn('[I.S.O PRO] PDF local indisponível, fallback HTML:', e);
    if (acao === 'guardar' && api?.saveHtmlAsPdf) {
      return api.saveHtmlAsPdf(html);
    }
    if (acao === 'imprimir' && api?.printHtml) {
      return api.printHtml(html);
    }
    return abrirPreVisualizacaoHtmlRelatorio(html, { tituloCarregamento: tituloStr });
  }
}

export async function imprimirRelatorioProfissional(opts: RelatorioProfissionalOpts): Promise<boolean> {
  const res = await entregarHtmlPdfLocal(opts.html, opts.fileName, 'imprimir', opts.titulo ?? opts.fileName);
  return res.ok;
}

export async function guardarRelatorioProfissional(
  opts: RelatorioProfissionalOpts,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return entregarHtmlPdfLocal(opts.html, opts.fileName, 'guardar', opts.titulo);
}

export async function preVisualizarRelatorioProfissional(
  opts: RelatorioProfissionalOpts,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return entregarHtmlPdfLocal(opts.html, opts.fileName, 'preview', opts.titulo ?? opts.fileName);
}

/** Gera bytes PDF sem entregar (auditoria / testes). */
export async function gerarBytesRelatorioProfissional(
  opts: RelatorioProfissionalOpts,
): Promise<{ ok: true; bytes: Uint8Array; origem: 'nuvem' | 'local' } | { ok: false; error: string }> {
  try {
    if (opts.tipoNuvem) {
      const gerado = await gerarHtmlRelatorioPdfBytes(opts.tipoNuvem, opts.html, opts.fileName);
      return { ok: true, bytes: gerado.bytes, origem: gerado.origem };
    }
    const bytes = await gerarPdfBytesFromHtmlLocal(opts.html);
    return { ok: true, bytes, origem: 'local' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
