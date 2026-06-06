import { describe, expect, it } from 'vitest';
import { createEmptyRelatorioFotograficoPayload, normalizeRelatorioFotograficoPayload } from '../services/relatorioFotografico.service';
import { mergeReportIntoBundle, parseRelatorioFotograficoCloudBundle } from './relatorioFotograficoCloudBundle';

describe('relatorioFotograficoCloudBundle', () => {
  it('migra payload legado (relatorio unico) para bundle v2', () => {
    const legacy = normalizeRelatorioFotograficoPayload({
      ...createEmptyRelatorioFotograficoPayload(),
      reportId: 'rf-1',
      titulo: 'Teste',
    });
    const bundle = parseRelatorioFotograficoCloudBundle(legacy, normalizeRelatorioFotograficoPayload);
    expect(bundle.version).toBe(2);
    expect(bundle.catalog.ids).toContain('rf-1');
    expect(bundle.reports['rf-1']?.titulo).toBe('Teste');
  });

  it('mergeReportIntoBundle mantem outros relatorios', () => {
    const a = normalizeRelatorioFotograficoPayload({
      ...createEmptyRelatorioFotograficoPayload(),
      reportId: 'a',
    });
    const b = normalizeRelatorioFotograficoPayload({
      ...createEmptyRelatorioFotograficoPayload(),
      reportId: 'b',
      titulo: 'B',
    });
    let bundle = parseRelatorioFotograficoCloudBundle(a, normalizeRelatorioFotograficoPayload);
    bundle = mergeReportIntoBundle(bundle, b);
    expect(bundle.catalog.ids[0]).toBe('b');
    expect(bundle.reports.a).toBeDefined();
    expect(bundle.reports.b?.titulo).toBe('B');
  });
});
