import { afterEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('./supabase', () => ({
  getSupabase: () => ({ rpc }),
}));
vi.mock('./isoProTenant', () => ({
  getActiveTenantId: () => '00000000-0000-0000-0000-000000000001',
}));
vi.mock('./errorReporting', () => ({
  captureOperationalEvent: vi.fn(),
}));

afterEach(() => {
  rpc.mockReset();
  vi.resetModules();
});

describe('escalaOutbox', () => {
  it('flushEscalaOutboxBestEffort chama RPC', async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    const { flushEscalaOutboxBestEffort } = await import('./escalaOutbox');
    await flushEscalaOutboxBestEffort(3);
    expect(rpc).toHaveBeenCalledWith('iso_pro_flush_escala_outbox', {
      p_tenant_id: '00000000-0000-0000-0000-000000000001',
      p_max: 3,
    });
  });

  it('fetchEscalaOutboxStatus mapeia contagens', async () => {
    rpc.mockResolvedValue({
      data: { pending: 2, processing: 0, failed: 1, done24h: 4, failures: [{ domain: 'rir' }] },
      error: null,
    });
    const { fetchEscalaOutboxStatus } = await import('./escalaOutbox');
    const status = await fetchEscalaOutboxStatus();
    expect(status).toEqual({
      pending: 2,
      processing: 0,
      failed: 1,
      done24h: 4,
      failures: [{ domain: 'rir' }],
    });
  });

  it('ignora RPC em falta no flush', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'PGRST202 could not find the function' } });
    const { flushEscalaOutboxBestEffort } = await import('./escalaOutbox');
    await expect(flushEscalaOutboxBestEffort()).resolves.toBeUndefined();
  });

  it('ensureEscalaOutboxPendingBestEffort chama ensure + flush', async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    const { ensureEscalaOutboxPendingBestEffort } = await import('./escalaOutbox');
    await ensureEscalaOutboxPendingBestEffort('documentos', 'test');
    expect(rpc).toHaveBeenCalledWith('iso_pro_escala_outbox_ensure_pending', {
      p_tenant_id: '00000000-0000-0000-0000-000000000001',
      p_domain: 'documentos',
      p_reason: 'test',
    });
    expect(rpc).toHaveBeenCalledWith('iso_pro_flush_escala_outbox', {
      p_tenant_id: '00000000-0000-0000-0000-000000000001',
      p_max: 8,
    });
  });
});
