import { PDFDocument } from 'pdf-lib';
import {
  RIR_PDF_AUTHOR,
  RIR_PDF_CREATOR,
  RIR_PDF_ENGINE_MARKER,
  RIR_PDF_VERSION,
  assuntoMetadadosRir,
  producerMetadadosRir,
} from './rirPdfMarkers';

export {
  RIR_PDF_VERSION,
  RIR_PDF_ENGINE_MARKER,
  RIR_PDF_CREATOR,
  RIR_PDF_AUTHOR,
} from './rirPdfMarkers';

export function aplicarMetadadosRirPdf(doc: PDFDocument, codigoRir: string): void {
  const codigo = (codigoRir || 'documento').trim();
  doc.setTitle(`RIR ${codigo}`);
  doc.setAuthor(RIR_PDF_AUTHOR);
  doc.setCreator(RIR_PDF_CREATOR);
  doc.setProducer(producerMetadadosRir());
  doc.setSubject(assuntoMetadadosRir());
  doc.setKeywords([RIR_PDF_ENGINE_MARKER, `rir-${codigo}`, `v${RIR_PDF_VERSION}`, 'pdf-lib-programatico']);
}

/** Valida PDF oficial RIR (metadados embutidos pelo motor programático). */
export async function validarPdfRirOficial(
  bytes: Uint8Array,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (bytes.length < 64) {
    return { ok: false, error: 'PDF vazio ou incompleto.' };
  }
  if (String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!, bytes[4]!) !== '%PDF-') {
    return { ok: false, error: 'Arquivo não é um PDF válido.' };
  }

  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const subject = doc.getSubject() ?? '';
    const creator = doc.getCreator() ?? '';
    const title = doc.getTitle() ?? '';

    if (!subject.includes(RIR_PDF_ENGINE_MARKER)) {
      return {
        ok: false,
        error:
          'PDF não foi gerado pelo motor oficial RIR. Use «Guardar PDF» na pré-visualização do I.S.O PRO (não Ctrl+P / Imprimir para PDF do Windows).',
      };
    }
    if (!creator.includes('I.S.O PRO Desktop')) {
      return { ok: false, error: 'Creator do PDF não corresponde ao I.S.O PRO Desktop.' };
    }
    if (!title.startsWith('RIR ')) {
      return { ok: false, error: `Título inválido: esperado "RIR ...", obtido "${title || '(vazio)'}".` };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `PDF ilegível: ${msg}` };
  }
}
