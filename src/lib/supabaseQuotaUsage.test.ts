import { describe, expect, it } from 'vitest';
import { formatQuotaBytes, QUOTA_DATABASE_LIMIT_BYTES, QUOTA_STORAGE_LIMIT_BYTES } from './supabaseQuotaUsage';

describe('supabaseQuotaUsage', () => {
  it('formatQuotaBytes', () => {
    expect(formatQuotaBytes(512)).toBe('512 B');
    expect(formatQuotaBytes(2048)).toMatch(/KB/);
    expect(formatQuotaBytes(5 * 1024 * 1024)).toMatch(/MB/);
    expect(formatQuotaBytes(QUOTA_DATABASE_LIMIT_BYTES)).toMatch(/GB/);
    expect(formatQuotaBytes(QUOTA_STORAGE_LIMIT_BYTES)).toMatch(/GB/);
  });
});
