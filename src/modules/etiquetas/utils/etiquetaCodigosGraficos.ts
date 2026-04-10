import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { escapeHtmlRelatorio } from '../../../lib/htmlRelatorioInstitucional';
import type { EtiquetaCodigosOpcao } from '../types/etiqueta.types';

/**
 * Codigo de barras (CODE128) como SVG embutido no HTML de impressao.
 * Exige `document` (fluxo no navegador / Electron renderer).
 */
export function montarSvgBarcodeCode128(texto: string, heightPx = 44): string {
  const raw = texto.trim() || '—';
  if (typeof document === 'undefined') {
    return `<span class="etiq-barcode-fallback">${escapeHtmlRelatorio(raw)}</span>`;
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const opts = {
    format: 'CODE128' as const,
    displayValue: true,
    fontSize: 9,
    height: heightPx,
    margin: 2,
    width: 2,
  };
  try {
    JsBarcode(svg, raw, opts);
  } catch {
    try {
      JsBarcode(svg, raw.replace(/[^\x20-\x7E]/g, '?'), opts);
    } catch {
      return `<span class="etiq-barcode-fallback">${escapeHtmlRelatorio(raw)}</span>`;
    }
  }
  return svg.outerHTML;
}

export async function montarDataUrlQr(texto: string, widthPx: number): Promise<string> {
  return QRCode.toDataURL(texto, { width: widthPx, margin: 1, errorCorrectionLevel: 'M' });
}

export async function montarHtmlCodigosNaEtiqueta(
  opcao: EtiquetaCodigosOpcao,
  payloadBarcode: string,
  payloadQr: string,
  compacto: boolean,
): Promise<string> {
  if (opcao === 'nenhum') return '';
  const h = compacto ? 34 : 44;
  /** Largura do QR em px (ECC M). Menor que antes para ganhar espaço na etiqueta; ainda confortável para leitura em celular. */
  const qrSize = compacto ? 76 : 92;
  const chunks: string[] = [];
  if (opcao === 'codigo_barras' || opcao === 'ambos') {
    chunks.push(`<div class="etiq-barcode-wrap">${montarSvgBarcodeCode128(payloadBarcode, h)}</div>`);
  }
  if (opcao === 'qrcode' || opcao === 'ambos') {
    const dataUrl = await montarDataUrlQr(payloadQr, qrSize);
    chunks.push(
      `<div class="etiq-qr-wrap"><img class="etiq-qr-img" width="${qrSize}" height="${qrSize}" src="${dataUrl}" alt="" /></div>`,
    );
  }
  return `<div class="etiq-codigos-row">${chunks.join('')}</div>`;
}
