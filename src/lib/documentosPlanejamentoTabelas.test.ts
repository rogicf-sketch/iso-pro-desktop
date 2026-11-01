import { describe, expect, it } from 'vitest';
import { DOCUMENTOS_UPSERT_CHUNK_SIZE, DOCUMENTOS_UPSERT_MAX_ITENS } from './documentosPlanejamentoTabelas';

describe('documentosPlanejamentoTabelas', () => {
  it('agrupa a importacao por volume, nao um pedido a cada 40 desenhos', () => {
    expect(DOCUMENTOS_UPSERT_CHUNK_SIZE).toBeGreaterThanOrEqual(2000);
    expect(DOCUMENTOS_UPSERT_MAX_ITENS).toBeGreaterThanOrEqual(2000);
  });
});
