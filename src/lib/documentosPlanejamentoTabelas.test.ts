import { describe, expect, it } from 'vitest';
import { DOCUMENTOS_UPSERT_CHUNK_SIZE } from './documentosPlanejamentoTabelas';

describe('documentosPlanejamentoTabelas', () => {
  it('usa lotes pequenos o suficiente para import web/PC', () => {
    expect(DOCUMENTOS_UPSERT_CHUNK_SIZE).toBeGreaterThan(0);
    expect(DOCUMENTOS_UPSERT_CHUNK_SIZE).toBeLessThanOrEqual(100);
  });
});
