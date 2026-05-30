/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';

const BACKFILL_PCT_KEY = getScopedIsoProStorageKey('iso-pro-materiais-backfill-percentual-alerta-v1');

const remoteRows = Array.from({ length: 1050 }, (_, i) => ({
  id: i + 1,
  codigo: `MAT-${String(i + 1).padStart(5, '0')}`,
  codigo_barras: `7899999${String(i + 1).padStart(5, '0')}5`,
  descricao: `Material ${i + 1}`,
  diametro: '-',
  disciplina: 'Instrumentação',
  unidade: 'UN',
  peso: 0,
  estoque_minimo: 0,
  ativo: true,
}));

const supabaseMock = vi.hoisted(() => {
  const range = vi.fn((from: number, to: number) =>
    Promise.resolve({
      data: remoteRows.slice(from, to + 1),
      error: null,
    }),
  );
  const order = vi.fn().mockReturnValue({ range });
  const eqTenant = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq: eqTenant });
  const from = vi.fn().mockReturnValue({ select });
  return { from, range, order };
});

vi.mock('../../../lib/supabase', () => ({
  hasSupabaseConfig: () => true,
  shouldUseCloudMaterials: () => true,
  getSupabase: () => ({ from: supabaseMock.from }),
}));

vi.mock('../../../lib/isoProTenant', () => ({
  getActiveTenantId: () => '00000000-0000-0000-0000-000000000001',
}));

import { carregarMateriaisDoCadastro } from './materiais.service';

describe('listRemoteMaterials / paginacao Supabase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem(BACKFILL_PCT_KEY, '1');
  });

  it('carrega mais de 1000 materiais da nuvem em paginas', async () => {
    const items = await carregarMateriaisDoCadastro();
    expect(items).toHaveLength(1050);
    expect(items[0]?.codigo).toBe('MAT-00001');
    expect(items[1049]?.codigo).toBe('MAT-01050');
    expect(supabaseMock.range).toHaveBeenCalledTimes(2);
    expect(supabaseMock.range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(supabaseMock.range).toHaveBeenNthCalledWith(2, 1000, 1999);
  });
});
