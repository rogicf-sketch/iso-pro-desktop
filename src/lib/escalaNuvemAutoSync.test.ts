/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  hasSupabaseConfig: vi.fn(() => true),
  listDocs: vi.fn(),
  listRecs: vi.fn(),
  listInv: vi.fn(),
  syncDocs: vi.fn(),
  syncRecs: vi.fn(),
  syncInv: vi.fn(),
  syncRir: vi.fn(),
  syncRnc: vi.fn(),
}));

vi.mock('./isoProTenant', () => ({ getActiveTenantId: () => 'tenant-1' }));
vi.mock('./supabase', () => ({ hasSupabaseConfig: () => h.hasSupabaseConfig() }));
vi.mock('./documentosPlanejamentoTabelas', () => ({
  listDocumentosPlanejamentoPageFromCloud: (a: unknown) => h.listDocs(a),
  syncDocumentosPlanejamentoFromSnapshot: () => h.syncDocs(),
}));
vi.mock('./recebimentosTabelas', () => ({
  listRecebimentosPageFromCloud: (a: unknown) => h.listRecs(a),
  syncRecebimentosFromSnapshot: () => h.syncRecs(),
}));
vi.mock('./inventariosTabelas', () => ({
  listInventariosPageFromCloud: (a: unknown) => h.listInv(a),
  syncInventariosFromSnapshot: () => h.syncInv(),
}));
vi.mock('./qualidadeTabelas', () => ({
  syncRirFromSnapshot: () => h.syncRir(),
  syncRncFromSnapshot: () => h.syncRnc(),
}));

import { tentarAutoSyncEscalaNuvemNaEntrada } from './escalaNuvemAutoSync';

const comTotal = (total: number) => Promise.resolve({ total, error: null });

beforeEach(() => {
  sessionStorage.clear();
  Object.values(h).forEach((fn) => fn.mockReset?.());
  h.hasSupabaseConfig.mockReturnValue(true);
});

afterEach(() => vi.restoreAllMocks());

describe('tentarAutoSyncEscalaNuvemNaEntrada', () => {
  it('nao corre sem Supabase configurado', async () => {
    h.hasSupabaseConfig.mockReturnValue(false);
    const r = await tentarAutoSyncEscalaNuvemNaEntrada();
    expect(r).toEqual({ ran: false, skippedReason: 'sem-supabase' });
  });

  it('nao corre duas vezes na mesma sessao', async () => {
    h.listDocs.mockReturnValue(comTotal(5));
    h.listRecs.mockReturnValue(comTotal(5));
    h.listInv.mockReturnValue(comTotal(5));

    await tentarAutoSyncEscalaNuvemNaEntrada();
    const segunda = await tentarAutoSyncEscalaNuvemNaEntrada();
    expect(segunda).toEqual({ ran: false, skippedReason: 'ja-tentou-sessao' });
  });

  it('nao sincroniza quando as tabelas ja tem dados', async () => {
    h.listDocs.mockReturnValue(comTotal(3));
    h.listRecs.mockReturnValue(comTotal(2));
    h.listInv.mockReturnValue(comTotal(1));

    const r = await tentarAutoSyncEscalaNuvemNaEntrada();
    expect(r).toEqual({ ran: false, skippedReason: 'ja-com-dados' });
    expect(h.syncDocs).not.toHaveBeenCalled();
  });

  it('sincroniza apenas os dominios vazios', async () => {
    h.listDocs.mockReturnValue(comTotal(0));
    h.listRecs.mockReturnValue(comTotal(4));
    h.listInv.mockReturnValue(comTotal(4));
    h.syncDocs.mockResolvedValue({ ok: true, documentos: 12 });

    const r = await tentarAutoSyncEscalaNuvemNaEntrada();
    expect(r.ran).toBe(true);
    expect(r.documentos).toBe(12);
    expect(h.syncDocs).toHaveBeenCalledTimes(1);
    expect(h.syncRecs).not.toHaveBeenCalled();
    expect(h.syncInv).not.toHaveBeenCalled();
  });

  it('sincroniza inventarios + rir + rnc quando inventarios estao vazios', async () => {
    h.listDocs.mockReturnValue(comTotal(4));
    h.listRecs.mockReturnValue(comTotal(4));
    h.listInv.mockReturnValue(comTotal(0));
    h.syncInv.mockResolvedValue({ ok: true, inventarios: 7 });
    h.syncRir.mockResolvedValue({ ok: true });
    h.syncRnc.mockResolvedValue({ ok: true });

    const r = await tentarAutoSyncEscalaNuvemNaEntrada();
    expect(r.inventarios).toBe(7);
    expect(h.syncRir).toHaveBeenCalledTimes(1);
    expect(h.syncRnc).toHaveBeenCalledTimes(1);
  });

  it('nao lanca quando uma leitura rejeita (best-effort)', async () => {
    h.listDocs.mockRejectedValue(new Error('rede'));
    h.listRecs.mockReturnValue(comTotal(0));
    h.listInv.mockReturnValue(comTotal(0));

    const r = await tentarAutoSyncEscalaNuvemNaEntrada();
    expect(r).toEqual({ ran: false, skippedReason: 'erro' });
  });
});
