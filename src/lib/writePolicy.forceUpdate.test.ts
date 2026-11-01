import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/appMeta', () => ({ APP_VERSION: '0.1.237' }));
vi.mock('./isoProFeatureFlags', () => ({
  isFeatureEnabled: (name: string) => name === 'force_update_gate',
}));
vi.mock('./supabase', () => ({
  hasSupabaseConfig: () => true,
}));

describe('writePolicy force update', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('bloqueia writes quando versao < FORCE e gate activo', async () => {
    const { isBusinessLocalWriteBlocked, whenBusinessWriteBlockedResult, isForceUpdateWriteBlocked } =
      await import('./writePolicy');
    expect(isForceUpdateWriteBlocked()).toBe(true);
    expect(isBusinessLocalWriteBlocked()).toBe(true);
    const blocked = whenBusinessWriteBlockedResult<void>();
    expect(blocked?.success).toBe(false);
    expect(String(blocked?.error ?? '')).toMatch(/Actualizacao obrigatoria/i);
  });
});
