import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/supabase', () => ({
  hasSupabaseConfig: vi.fn(() => true),
  getSupabase: vi.fn(),
}));

vi.mock('../../../lib/isoProTenant', () => ({
  getActiveTenantId: vi.fn(() => 'tenant-test'),
}));

import { getSupabase, hasSupabaseConfig } from '../../../lib/supabase';
import { labelOrigemComando, listarAtendimentoComandosAdmin, reprocessarAtendimentoComandoAdmin } from './atendimentoSyncAdmin.service';

const mockedGetSupabase = vi.mocked(getSupabase);
const mockedHasSupabaseConfig = vi.mocked(hasSupabaseConfig);

describe('atendimentoSyncAdmin.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedHasSupabaseConfig.mockReturnValue(true);
  });

  it('retorna indisponivel quando Supabase nao configurado', async () => {
    mockedHasSupabaseConfig.mockReturnValue(false);
    const r = await listarAtendimentoComandosAdmin();
    expect(r.source).toBe('indisponivel');
    expect(r.items).toEqual([]);
  });

  it('mapeia resposta do RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        total: 2,
        pendentes: 1,
        sucesso24h: 1,
        items: [
          {
            id: 'cmd-1',
            idempotencyKey: 'pc-at-uuid-ATD-00001',
            baselineUpdatedAt: '2026-07-06T00:00:00.000Z',
            snapshotUpdatedAt: '2026-07-06T00:00:01.000Z',
            createdAt: '2026-07-06T00:00:00.000Z',
            status: 'ok',
            historicoCount: 3,
            documentosCount: 1,
            atendimentosCount: 1,
            estornoCount: 0,
            origem: 'pc',
          },
        ],
      },
      error: null,
    }));
    mockedGetSupabase.mockReturnValue({ rpc } as never);

    const r = await listarAtendimentoComandosAdmin();
    expect(r.source).toBe('supabase');
    expect(r.total).toBe(2);
    expect(r.pendentes).toBe(1);
    expect(r.items[0]?.idempotencyKey).toBe('pc-at-uuid-ATD-00001');
    expect(r.items[0]?.atendimentosCount).toBe(1);
    expect(r.items[0]?.estornoCount).toBe(0);
    expect(rpc).toHaveBeenCalledWith('iso_pro_list_atendimento_comandos', {
      p_tenant_id: 'tenant-test',
      p_limit: 50,
      p_offset: 0,
    });
  });

  it('avisa quando RPC nao existe', async () => {
    mockedGetSupabase.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: 'PGRST202', message: 'Could not find the function' },
      })),
    } as never);

    const r = await listarAtendimentoComandosAdmin();
    expect(r.source).toBe('indisponivel');
    expect(r.warning).toContain('iso_pro_list_atendimento_comandos');
  });

  it('reprocessa comando pendente via RPC', async () => {
    const rpc = vi.fn(async (fn: string) => {
      if (fn === 'iso_pro_reprocess_atendimento_comando') {
        return { data: { ok: true, snapshotUpdatedAt: '2026-07-07T12:00:00.000Z' }, error: null };
      }
      return { data: null, error: null };
    });
    mockedGetSupabase.mockReturnValue({ rpc } as never);

    const r = await reprocessarAtendimentoComandoAdmin('cmd-pendente');
    expect(r.ok).toBe(true);
    expect(r.snapshotUpdatedAt).toContain('2026-07-07');
    expect(rpc).toHaveBeenCalledWith('iso_pro_reprocess_atendimento_comando', {
      p_tenant_id: 'tenant-test',
      p_comando_id: 'cmd-pendente',
    });
  });

  it('labelOrigemComando traduz origens', () => {
    expect(labelOrigemComando('mobile')).toBe('Mobile');
    expect(labelOrigemComando('pc')).toBe('PC');
  });
});
