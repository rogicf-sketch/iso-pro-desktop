import { gerarHtmlPdfFromPayload } from './htmlPaged.ts';

/**
 * RIR — motor HTML + Playwright (Chromium printToPDF).
 * Payload: { html: string, waitPagedJs?: boolean }
 */
export async function gerarRirPdfFromPayload(payload: unknown): Promise<Uint8Array> {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload RIR inválido.');
  }
  const p = payload as { html?: string; waitPagedJs?: boolean };
  if (typeof p.html !== 'string' || !p.html.trim()) {
    throw new Error(
      'Payload RIR deve conter HTML. O cliente deve enviar { html, waitPagedJs: false }.',
    );
  }
  return gerarHtmlPdfFromPayload({ html: p.html, waitPagedJs: p.waitPagedJs ?? false });
}
