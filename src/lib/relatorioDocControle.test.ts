import { describe, expect, it } from 'vitest';
import {
  htmlRodapeInstitucionalControle,
  linhaRodapeInstitucionalControle,
  payloadQrDocumentoControle,
} from './relatorioDocControle';

describe('relatorioDocControle', () => {
  it('monta QR como URL da pagina publica de verificacao', () => {
    const p = payloadQrDocumentoControle({
      tipo: 'RIR',
      codigo: 'RIR-INS-04',
      emitidoEm: '2026-10-24T18:44:00.000Z',
      versaoDoc: '7',
    });
    expect(p).toContain('isoprogestaodemateriais.com.br/#/verificar?');
    expect(p).toContain('t=RIR');
    expect(p).toContain('c=RIR-INS-04');
    expect(p).toContain('v=7');
  });

  it('linha de rodapé inclui empresa e CNPJ quando existem', () => {
    const linha = linhaRodapeInstitucionalControle({
      nomeEmpresa: 'Montcalm Montagens Industriais S/A',
      cnpj: '66.234.531/0001-57',
      codigo: 'RIR-ELE-01',
      versaoDoc: '7',
    });
    expect(linha).toContain('I.S.O PRO');
    expect(linha).toContain('Montcalm');
    expect(linha).toContain('CNPJ 66.234.531/0001-57');
    expect(linha).toContain('RIR-ELE-01');
    expect(linha).toContain('v7');
    expect(linha).not.toMatch(/Desktop/i);
  });

  it('html do rodapé marca documento controlado', () => {
    const html = htmlRodapeInstitucionalControle({
      nomeEmpresa: 'Acme',
      cnpj: '00.000.000/0001-00',
      codigo: 'RF-1',
      versaoDoc: '7',
      qrDataUrl: 'data:image/png;base64,xx',
    });
    expect(html).toContain('Documento controlado');
    expect(html).toContain('iso-doc-foot__qr');
    expect(html).toContain('Acme');
  });
});
