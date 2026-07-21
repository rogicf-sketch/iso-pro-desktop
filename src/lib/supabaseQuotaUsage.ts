/**
 * Cota Supabase no painel: Postgres (~8 GB) + Storage (~100 GB).
 */
import { getSupabase, hasSupabaseConfig } from './supabase';

export const QUOTA_DATABASE_LIMIT_BYTES = 8 * 1024 * 1024 * 1024;
export const QUOTA_STORAGE_LIMIT_BYTES = 100 * 1024 * 1024 * 1024;

export type QuotaUsageTone = 'ok' | 'warning' | 'danger' | 'neutral';

export type SupabaseQuotaUsage = {
  databaseBytes: number;
  storageBytes: number;
  evidenciasBytes: number;
  pdfsBytes: number;
  storageObjectCount: number;
  evidenciasObjectCount: number;
  databaseLimitBytes: number;
  storageLimitBytes: number;
  databasePercent: number;
  storagePercent: number;
  databaseTone: QuotaUsageTone;
  storageTone: QuotaUsageTone;
  databaseLabel: string;
  storageLabel: string;
  /** Ex.: "40% utilizado · 4.8 GB livre" */
  databaseDetail: string;
  /** Ex.: "2.438 arquivos · 13% usado" */
  storageDetail: string;
  updatedAt: string;
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  const gb = mb / 1024;
  const label = `${gb.toFixed(1)} GB`;
  return label.replace(/\.0 GB$/, ' GB');
}

function percentOf(used: number, limit: number): number {
  if (!limit || limit <= 0) return 0;
  return Math.min(100, Math.max(0, (used / limit) * 100));
}

function toneForPercent(pct: number): QuotaUsageTone {
  if (pct >= 90) return 'danger';
  if (pct >= 75) return 'warning';
  return 'ok';
}

function asFiniteNumber(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function formatQuotaBytes(bytes: number): string {
  return formatBytes(bytes);
}

export function formatQuotaFileCount(count: number): string {
  if (!Number.isFinite(count) || count < 0) return '0';
  return new Intl.NumberFormat('pt-BR').format(Math.round(count));
}

export function buildDatabaseQuotaDetail(usedBytes: number, limitBytes: number, percent: number): string {
  const free = Math.max(0, limitBytes - usedBytes);
  const pct = percent.toFixed(percent >= 10 ? 0 : 1);
  return `${pct}% utilizado · ${formatBytes(free)} livre`;
}

export function buildStorageQuotaDetail(
  objectCount: number,
  percent: number,
  evidenciasBytes: number,
): string {
  const pct = percent.toFixed(percent >= 10 ? 0 : 1);
  if (objectCount > 0) {
    return `${formatQuotaFileCount(objectCount)} arquivos · ${pct}% usado`;
  }
  if (evidenciasBytes > 0) {
    return `${formatBytes(evidenciasBytes)} evidências · ${pct}% usado`;
  }
  return `${pct}% usado`;
}

export async function fetchSupabaseQuotaUsage(): Promise<SupabaseQuotaUsage | null> {
  if (!hasSupabaseConfig()) return null;
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc('iso_pro_quota_usage');
  if (error || data == null) return null;

  const row = (typeof data === 'object' && !Array.isArray(data) ? data : {}) as Record<string, unknown>;
  if (row.ok === false) return null;

  const databaseBytes = asFiniteNumber(row.databaseBytes);
  const storageBytes = asFiniteNumber(row.storageBytes);
  const evidenciasBytes = asFiniteNumber(row.evidenciasBytes);
  const pdfsBytes = asFiniteNumber(row.pdfsBytes);
  const storageObjectCount = asFiniteNumber(row.storageObjectCount);
  const evidenciasObjectCount = asFiniteNumber(row.evidenciasObjectCount);
  const databaseLimitBytes = asFiniteNumber(row.databaseLimitBytes, QUOTA_DATABASE_LIMIT_BYTES) || QUOTA_DATABASE_LIMIT_BYTES;
  const storageLimitBytes = asFiniteNumber(row.storageLimitBytes, QUOTA_STORAGE_LIMIT_BYTES) || QUOTA_STORAGE_LIMIT_BYTES;

  const databasePercent = percentOf(databaseBytes, databaseLimitBytes);
  const storagePercent = percentOf(storageBytes, storageLimitBytes);

  return {
    databaseBytes,
    storageBytes,
    evidenciasBytes,
    pdfsBytes,
    storageObjectCount,
    evidenciasObjectCount,
    databaseLimitBytes,
    storageLimitBytes,
    databasePercent,
    storagePercent,
    databaseTone: toneForPercent(databasePercent),
    storageTone: toneForPercent(storagePercent),
    databaseLabel: `${formatBytes(databaseBytes)} / ${formatBytes(databaseLimitBytes)}`,
    storageLabel: `${formatBytes(storageBytes)} / ${formatBytes(storageLimitBytes)}`,
    databaseDetail: buildDatabaseQuotaDetail(databaseBytes, databaseLimitBytes, databasePercent),
    storageDetail: buildStorageQuotaDetail(
      storageObjectCount || evidenciasObjectCount,
      storagePercent,
      evidenciasBytes,
    ),
    updatedAt: new Date().toISOString(),
  };
}
