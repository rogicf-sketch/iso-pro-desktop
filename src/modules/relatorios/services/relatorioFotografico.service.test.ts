import { describe, expect, it } from 'vitest';
import { normalizeRelatorioFotograficoPayload } from './relatorioFotografico.service';

describe('relatorioFotografico.service / normalizeRelatorioFotograficoPayload', () => {
  it('devolve payload vazio para entrada invalida', () => {
    const r = normalizeRelatorioFotograficoPayload(null);
    expect(r.version).toBe(1);
    expect(r.fotos).toEqual([]);
  });

  it('filtra fotos sem dataUrl valido', () => {
    const r = normalizeRelatorioFotograficoPayload({
      version: 1,
      reportId: 'rid-1',
      salvoEm: '2020-01-01T00:00:00.000Z',
      titulo: 'Obra X',
      observacoes: '',
      rirCodigo: 'RIR-1',
      recebimentoId: '',
      recebimentoLabel: '',
      fotos: [
        {
          id: 'a',
          dataUrl: 'data:image/jpeg;base64,xx',
          legenda: 'L1',
          createdAt: '2026-01-01T00:00:00.000Z',
          mostrarLegendaImpressao: false,
        },
        { id: 'b', dataUrl: 'invalid', legenda: 'x', createdAt: '2026-01-01T00:00:00.000Z' },
      ],
      relatoriosGerados: 2,
    });
    expect(r.fotos).toHaveLength(1);
    expect(r.fotos[0]?.id).toBe('a');
    expect(r.fotos[0]?.mostrarLegendaImpressao).toBe(false);
    expect(r.titulo).toBe('Obra X');
    expect(r.relatoriosGerados).toBe(2);
  });
});
