import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
const store = new Map<string, string>();

vi.stubGlobal('fetch', fetchMock);
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    store.set(k, v);
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
  clear: () => {
    store.clear();
  },
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
});

vi.mock('./supabaseDesktopFetch', () => ({
  canUseDesktopSupabaseFetch: () => false,
  createDesktopSupabaseFetch: () => fetch,
}));

vi.mock('./isoProCloudConnection', () => ({
  readIsoProCloudConnectionComMigracao: () => ({
    supabaseUrl: 'https://ofeogtjydjdjrmrekebh.supabase.co',
    supabaseAnonKey: 'anon-key-test',
    materiaisNuvem: true,
  }),
}));

describe('rpcSemFilaAuth Bearer JWT', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ documentos: [], total: 0, _source: 'tables' }),
    });
    store.clear();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://ofeogtjydjdjrmrekebh.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-test');
  });

  afterEach(() => {
    store.clear();
    vi.unstubAllEnvs();
  });

  it('envia JWT quando sb-*-auth-token esta valido', async () => {
    const { resetSupabaseClient, rpcSemFilaAuth } = await import('./supabase');
    resetSupabaseClient();
    const exp = Math.floor(Date.now() / 1000) + 3600;
    localStorage.setItem(
      'sb-ofeogtjydjdjrmrekebh-auth-token',
      JSON.stringify({ access_token: 'user-jwt-token', expires_at: exp }),
    );

    await rpcSemFilaAuth('iso_pro_list_documentos_planejamento_page', {
      p_tenant_id: '11111111-1111-1111-1111-111111111111',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer user-jwt-token');
    expect(headers.apikey).toBe('anon-key-test');
  });

  it('cai na anon key quando nao ha sessao Auth', async () => {
    const { resetSupabaseClient, rpcSemFilaAuth } = await import('./supabase');
    resetSupabaseClient();

    await rpcSemFilaAuth('iso_pro_list_documentos_planejamento_page', {
      p_tenant_id: '11111111-1111-1111-1111-111111111111',
    });

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer anon-key-test');
  });
});
