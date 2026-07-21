import { describe, expect, it } from 'vitest';
import {
  buildDatabaseQuotaDetail,
  buildStorageQuotaDetail,
  formatQuotaBytes,
  formatQuotaFileCount,
  QUOTA_DATABASE_LIMIT_BYTES,
  QUOTA_STORAGE_LIMIT_BYTES,
} from './supabaseQuotaUsage';

describe('supabaseQuotaUsage', () => {
  it('formatQuotaBytes', () => {
    expect(formatQuotaBytes(512)).toBe('512 B');
    expect(formatQuotaBytes(2048)).toMatch(/KB/);
    expect(formatQuotaBytes(5 * 1024 * 1024)).toMatch(/MB/);
    expect(formatQuotaBytes(QUOTA_DATABASE_LIMIT_BYTES)).toMatch(/GB/);
    expect(formatQuotaBytes(QUOTA_STORAGE_LIMIT_BYTES)).toMatch(/GB/);
  });

  it('legendas de cota no estilo do painel', () => {
    expect(formatQuotaFileCount(2438)).toBe('2.438');
    expect(buildDatabaseQuotaDetail(3.2 * 1024 ** 3, QUOTA_DATABASE_LIMIT_BYTES, 40)).toBe(
      '40% utilizado · 4.8 GB livre',
    );
    expect(buildStorageQuotaDetail(2438, 13, 0)).toBe('2.438 arquivos · 13% usado');
  });
});
