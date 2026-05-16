import { describe, expect, it } from 'vitest';
import { parseDocumentosImportJsonRoot, parseRecebimentosImportJsonRoot } from './importArquivoPlano.zod';

describe('parseDocumentosImportJsonRoot', () => {
  it('aceita array no topo', () => {
    expect(parseDocumentosImportJsonRoot([{ id: '1' }])).toEqual([{ id: '1' }]);
  });

  it('aceita objeto com documentos', () => {
    expect(parseDocumentosImportJsonRoot({ documentos: [{ n: 1 }] })).toEqual([{ n: 1 }]);
  });

  it('rejeita objeto sem documentos array', () => {
    expect(parseDocumentosImportJsonRoot({ documentos: 'x' })).toBeNull();
  });
});

describe('parseRecebimentosImportJsonRoot', () => {
  it('aceita array no topo', () => {
    expect(parseRecebimentosImportJsonRoot([])).toEqual([]);
  });

  it('aceita objeto com recebimentos', () => {
    expect(parseRecebimentosImportJsonRoot({ recebimentos: [{ a: 1 }] })).toEqual([{ a: 1 }]);
  });
});
