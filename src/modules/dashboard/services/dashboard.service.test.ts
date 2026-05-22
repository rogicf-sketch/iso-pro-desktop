import { describe, expect, it, vi } from 'vitest';
import { getDashboardCloudPanel } from './dashboard.service';

vi.mock('../../../lib/supabase', () => ({
  getSupabaseOperationalStatus: vi.fn(() => 'ready'),
  getRuntimeSupabaseConfig: vi.fn(() => ({ url: 'https://x.supabase.co', key: 'k', materiaisNuvem: true })),
}));

describe('getDashboardCloudPanel', () => {
  it('retorna painel ok quando supabase configurado', () => {
    const panel = getDashboardCloudPanel();
    expect(panel.status).toBe('ready');
    expect(panel.tone).toBe('ok');
    expect(panel.materiaisNuvem).toBe(true);
  });
});
