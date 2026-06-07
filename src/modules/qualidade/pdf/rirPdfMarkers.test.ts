/** @vitest-environment node */
import './rirPdfFonts.test-setup';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { validarPdfRirOficial } from './rirPdfMetadata';
import { RIR_PDF_ENGINE_MARKER, RIR_PDF_VERSION, assuntoMetadadosRir } from './rirPdfMarkers';
import { gerarRirPdfBytes } from './rirPdfDocument';
import type { RirPdfContexto } from './rirPdfDocument';

function ctxMinimo(): RirPdfContexto {
  return {
    registro: {
      id: 'rir-1',
      codigo: 'RIR-INS-99',
      dataRegistro: '2026-06-01',
      recebimentoId: 'rec-1',
      itensRir: [{ id: 'i1', codigoMaterial: 'M1', descricaoMaterial: 'Teste', quantidade: 1, unidade: 'PÇ', certificado: 'N/A' }],
      observacoesQc: 'OK',
      laudo: 'aprovado',
      assinaturaRecebimento: { nome: 'A', data: '2026-06-01' },
      assinaturaCq: { nome: 'B', data: '2026-06-01' },
      assinaturaCliente: { nome: 'C', data: '2026-06-01' },
      status: 'tratado',
    } as RirPdfContexto['registro'],
    branding: { cliente: 'I.S.O PRO', projeto: 'Obra' },
    uoExibir: 'UO',
    localExibir: 'Local',
    contratoExibir: '1',
    disciplinaExibir: 'Eletrica',
    escopoLinha: 'TEST',
    emitidoEm: '01/06/2026',
  };
}

describe('rirPdfMetadata', () => {
  it('assunto contem marcador oficial', () => {
    expect(assuntoMetadadosRir()).toContain(RIR_PDF_ENGINE_MARKER);
    expect(assuntoMetadadosRir()).toContain(RIR_PDF_VERSION);
  });

  it('PDF gerado passa validacao oficial', async () => {
    const bytes = await gerarRirPdfBytes(ctxMinimo());
    expect((await validarPdfRirOficial(bytes)).ok).toBe(true);

    const doc = await PDFDocument.load(bytes);
    expect(doc.getTitle()).toBe('RIR RIR-INS-99');
    expect(doc.getSubject()).toContain(RIR_PDF_ENGINE_MARKER);
  });

  it('rejeita PDF sem marcador', async () => {
    const doc = await PDFDocument.create();
    doc.setTitle('RIR FAKE');
    const raw = await doc.save();
    expect((await validarPdfRirOficial(new Uint8Array(raw))).ok).toBe(false);
  });
});
