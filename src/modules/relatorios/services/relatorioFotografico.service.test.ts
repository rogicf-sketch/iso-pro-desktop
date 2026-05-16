/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';
import {
  estimativaBytesPayloadRelatorioFotografico,
  estimativaBytesTodoLocalStorageAposGravar,
  normalizeRelatorioFotograficoPayload,
} from './relatorioFotografico.service';

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
    expect(r.fotos[0]?.dataUrl).toBe('data:image/jpeg;base64,xx');
    expect(r.fotos[0]?.mostrarLegendaImpressao).toBe(false);
    expect(r.titulo).toBe('Obra X');
    expect(r.relatoriosGerados).toBe(2);
  });
});

describe('relatorioFotografico.service / normalize com imageRef', () => {
  it('aceita foto só com referência iso-media (IndexedDB)', () => {
    const r = normalizeRelatorioFotograficoPayload({
      version: 1,
      reportId: 'rid-x',
      salvoEm: '2026-01-01T00:00:00.000Z',
      titulo: 'T',
      fotos: [
        {
          id: 'f1',
          dataUrl: '',
          imageRef: 'iso-media:rf:rid-x:f1',
          legenda: 'L',
          createdAt: '2026-01-01T00:00:00.000Z',
          mostrarLegendaImpressao: true,
        },
      ],
    });
    expect(r.fotos).toHaveLength(1);
    expect(r.fotos[0]?.imageRef).toBe('iso-media:rf:rid-x:f1');
  });
});

describe('relatorioFotografico.service / estimativas de armazenamento', () => {
  it('estimativaBytesPayloadRelatorioFotografico reflete tamanho do JSON', () => {
    const p = normalizeRelatorioFotograficoPayload({
      version: 1,
      reportId: 'r1',
      salvoEm: '2026-01-01T00:00:00.000Z',
      titulo: 'T',
      fotos: [
        {
          id: 'a',
          dataUrl: 'data:image/jpeg;base64,abcd',
          legenda: 'L',
          createdAt: '2026-01-01T00:00:00.000Z',
          mostrarLegendaImpressao: true,
        },
      ],
    });
    const n = estimativaBytesPayloadRelatorioFotografico(p);
    expect(n).toBeGreaterThan(100);
    expect(n).toBe(new Blob([JSON.stringify(normalizeRelatorioFotograficoPayload(p))]).size);
  });

  it('estimativaBytesTodoLocalStorageAposGravar projeta delta ao substituir payload', () => {
    const key = getScopedIsoProStorageKey('iso-pro-rf-payload-v1-rid-test');
    const other = 'iso-pro-outro-teste';
    localStorage.setItem(other, 'x'.repeat(100));
    localStorage.setItem(key, JSON.stringify({ reportId: 'rid-test', fotos: [] }));
    let baseLs = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const v = localStorage.getItem(k);
      if (v) baseLs += new Blob([v]).size;
    }

    const p = normalizeRelatorioFotograficoPayload({
      version: 1,
      reportId: 'rid-test',
      salvoEm: '2026-01-01T00:00:00.000Z',
      titulo: 'Grande',
      fotos: [
        {
          id: 'a',
          dataUrl: 'data:image/jpeg;base64,' + 'Z'.repeat(500),
          legenda: 'L',
          createdAt: '2026-01-01T00:00:00.000Z',
          mostrarLegendaImpressao: true,
        },
      ],
    });

    const proj = estimativaBytesTodoLocalStorageAposGravar('rid-test', p);
    const prev = new Blob([localStorage.getItem(key) ?? '']).size;
    const next = estimativaBytesPayloadRelatorioFotografico(p);
    expect(proj).toBe(baseLs - prev + next);

    localStorage.removeItem(key);
    localStorage.removeItem(other);
  });
});
