import { beforeEach, describe, expect, it, vi } from 'vitest';

const store: Record<string, string> = {};

vi.mock('../../../lib/supabase', () => ({
  hasSupabaseConfig: vi.fn(() => false),
  shouldUseCloudMaterials: vi.fn(() => false),
  getSupabase: vi.fn(() => null),
}));

vi.mock('../../../lib/dataReadPolicy', () => ({
  shouldTryRemoteRead: vi.fn(() => false),
  withRemoteReadTimeout: vi.fn(async (fn: () => Promise<unknown>) => fn()),
  REMOTE_READ_PREFER_MS: 450,
}));

vi.mock('../../../lib/isoProAmbiente', () => ({
  getScopedIsoProStorageKey: (k: string) => k,
}));

describe('indice O(1) de leitura de materiais', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    vi.stubGlobal(
      'localStorage',
      {
        getItem: (key: string) => (key in store ? store[key] : null),
        setItem: (key: string, value: string) => {
          store[key] = value;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
        clear: () => {
          for (const k of Object.keys(store)) delete store[k];
        },
        key: () => null,
        length: 0,
      } as Storage,
    );
    vi.resetModules();
  });

  it('resolve por codigo e codigo de barras apos aquecer indice', async () => {
    store['iso-pro-desktop-materiais'] = JSON.stringify([
      {
        id: '1',
        codigo: 'ATER0009',
        codigoBarras: '7891234567890',
        descricao: 'Parafuso',
        diametro: '',
        disciplina: '',
        unidade: 'PC',
        peso: 0,
        estoqueMinimo: 0,
        saldoAtual: 10,
        ativo: true,
        observacao: '',
      },
      {
        id: '2',
        codigo: 'OFF',
        codigoBarras: '1111111111111',
        descricao: 'Inativo',
        diametro: '',
        disciplina: '',
        unidade: 'PC',
        peso: 0,
        estoqueMinimo: 0,
        saldoAtual: 0,
        ativo: false,
        observacao: '',
      },
    ]);

    const {
      aquecerIndiceLeituraMateriais,
      buscarMaterialPorLeituraCodigo,
      invalidateMateriaisBaseCache,
    } = await import('./materiais.service');

    await aquecerIndiceLeituraMateriais();
    invalidateMateriaisBaseCache(); // SWR: indice permanece

    const byCode = await buscarMaterialPorLeituraCodigo('ater0009');
    expect(byCode.success).toBe(true);
    expect(byCode.data?.codigo).toBe('ATER0009');

    const byBar = await buscarMaterialPorLeituraCodigo('7891234567890');
    expect(byBar.success).toBe(true);
    expect(byBar.data?.codigo).toBe('ATER0009');

    const inativo = await buscarMaterialPorLeituraCodigo('OFF');
    expect(inativo.data).toBeNull();
  });
});
