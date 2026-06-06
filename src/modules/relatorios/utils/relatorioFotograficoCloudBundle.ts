import type { RelatorioFotograficoMeta, RelatorioFotograficoPayload } from '../types/relatorioFotografico.types';

type NormalizePayload = (raw: unknown) => RelatorioFotograficoPayload;

export type RelatorioFotograficoCloudBundleV2 = {
  version: 2;
  catalog: { version: 1; ids: string[] };
  reports: Record<string, RelatorioFotograficoPayload>;
};

function isBundleV2(raw: unknown): raw is RelatorioFotograficoCloudBundleV2 {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  return o.version === 2 && typeof o.reports === 'object' && o.reports !== null;
}

/** Converte payload remoto legado (um único relatório) ou bundle v2. */
export function parseRelatorioFotograficoCloudBundle(
  raw: unknown,
  normalize: NormalizePayload,
): RelatorioFotograficoCloudBundleV2 {
  if (isBundleV2(raw)) {
    const reports: Record<string, RelatorioFotograficoPayload> = {};
    for (const [id, p] of Object.entries(raw.reports)) {
      const norm = normalize(p);
      const rid = norm.reportId.trim() || id.trim();
      if (rid) reports[rid] = { ...norm, reportId: rid };
    }
    const ids = Array.isArray(raw.catalog?.ids)
      ? raw.catalog.ids.map((x) => String(x).trim()).filter(Boolean)
      : Object.keys(reports);
    const mergedIds = [...new Set([...ids, ...Object.keys(reports)])];
    return { version: 2, catalog: { version: 1, ids: mergedIds }, reports };
  }

  const single = normalize(raw);
  const id = single.reportId.trim();
  if (!id) {
    return { version: 2, catalog: { version: 1, ids: [] }, reports: {} };
  }
  return {
    version: 2,
    catalog: { version: 1, ids: [id] },
    reports: { [id]: single },
  };
}

export function emptyRelatorioFotograficoCloudBundle(): RelatorioFotograficoCloudBundleV2 {
  return { version: 2, catalog: { version: 1, ids: [] }, reports: {} };
}

export function mergeReportIntoBundle(
  bundle: RelatorioFotograficoCloudBundleV2,
  payload: RelatorioFotograficoPayload,
): RelatorioFotograficoCloudBundleV2 {
  const id = payload.reportId.trim();
  if (!id) return bundle;
  const nextReports = { ...bundle.reports, [id]: payload };
  const ids = [id, ...bundle.catalog.ids.filter((x) => x !== id)];
  return { version: 2, catalog: { version: 1, ids }, reports: nextReports };
}

export function listMetadadosFromBundle(bundle: RelatorioFotograficoCloudBundleV2): RelatorioFotograficoMeta[] {
  const out: RelatorioFotograficoMeta[] = [];
  for (const id of bundle.catalog.ids) {
    const p = bundle.reports[id];
    if (!p) continue;
    out.push({
      id: p.reportId || id,
      titulo: p.titulo.trim() || '(sem título)',
      numeroRelatorio: p.numeroRelatorio.trim(),
      salvoEm: p.salvoEm,
      fotoCount: p.fotos.length,
    });
  }
  return out;
}

export function removeReportFromBundle(bundle: RelatorioFotograficoCloudBundleV2, reportId: string): RelatorioFotograficoCloudBundleV2 {
  const id = reportId.trim();
  if (!id) return bundle;
  const reports = { ...bundle.reports };
  delete reports[id];
  return {
    version: 2,
    catalog: { version: 1, ids: bundle.catalog.ids.filter((x) => x !== id) },
    reports,
  };
}
