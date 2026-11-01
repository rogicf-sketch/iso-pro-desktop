import { describe, expect, it } from 'vitest';
import {
  parseDocumentoVerificacaoPayloadLegado,
  parseDocumentoVerificacaoSearch,
  urlVerificacaoDocumentoControle,
} from './documentoVerificacao';

describe('documentoVerificacao', () => {
  it('monta URL hash com parametros', () => {
    const url = urlVerificacaoDocumentoControle({
      tipo: 'RNC',
      codigo: '2026-001',
      emitidoEm: '2026-10-24T21:00:00.000Z',
      versaoDoc: '7',
      origin: 'https://isoprogestaodemateriais.com.br',
    });
    expect(url).toBe(
      'https://isoprogestaodemateriais.com.br/#/verificar?t=RNC&c=2026-001&e=2026-10-24T21%3A00%3A00.000Z&v=7',
    );
  });

  it('parseia query string da pagina', () => {
    const d = parseDocumentoVerificacaoSearch('t=RF&c=RF-2026-00001&e=2026-10-24T12:00:00.000Z&v=8');
    expect(d).toEqual({
      tipo: 'RF',
      codigo: 'RF-2026-00001',
      emitidoEm: '2026-10-24T12:00:00.000Z',
      versaoDoc: '8',
    });
  });

  it('parseia payload legado de QR antigos', () => {
    const d = parseDocumentoVerificacaoPayloadLegado('ISO-PRO|RIR|RIR-INS-04|2026-10-24T18:44:00.000Z|v7');
    expect(d?.tipo).toBe('RIR');
    expect(d?.codigo).toBe('RIR-INS-04');
    expect(d?.versaoDoc).toBe('7');
  });
});
