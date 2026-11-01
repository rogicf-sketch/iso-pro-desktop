import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  rpcSemFilaAuth: vi.fn(),
  clearIsoProJwtSession: vi.fn(),
  ensureIsoProDataSessionReadable: vi.fn(),
}));

vi.mock('./supabase', () => ({
  hasSupabaseConfig: () => true,
  shouldUseCloudMaterials: () => true,
  rpcSemFilaAuth: (...args: unknown[]) => mocks.rpcSemFilaAuth(...args),
  getSupabase: () => ({
    rpc: mocks.rpc,
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'jwt-alive' } } }),
    },
  }),
}));

vi.mock('./isoProJwtSession', () => ({
  clearIsoProJwtSession: mocks.clearIsoProJwtSession,
  ensureIsoProDataSessionReadable: mocks.ensureIsoProDataSessionReadable,
}));

vi.mock('./isoProTenant', () => ({
  getActiveTenantId: () => '11111111-1111-1111-1111-111111111111',
}));

vi.mock('./operacaoContagensCache', () => ({
  invalidateOperacaoContagensBestEffort: vi.fn(),
}));

import { listColaboradoresPageFromCloud } from './colaboradoresCloud';
import { listDocumentosPlanejamentoPageFromCloud } from './documentosPlanejamentoTabelas';
import { listMateriaisPageFromCloud } from './materiaisListaPaginada';
import {
  fetchOperacaoContagens,
  listDocumentosPendentesAtendimentoFromCloud,
} from './operacaoEscalaContagens';

describe('listas vazias nao apagam JWT', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.rpcSemFilaAuth.mockReset();
    mocks.clearIsoProJwtSession.mockReset();
    mocks.ensureIsoProDataSessionReadable.mockReset();
  });

  it('materiais total=0: uma RPC, sessao intacta', async () => {
    mocks.rpcSemFilaAuth.mockResolvedValue({ data: { materiais: [], total: 0, _source: 'tables' }, error: null });
    const result = await listMateriaisPageFromCloud();
    expect(result.total).toBe(0);
    expect(mocks.rpcSemFilaAuth).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.clearIsoProJwtSession).not.toHaveBeenCalled();
  });

  it('colaboradores total=0: uma RPC, sessao intacta', async () => {
    mocks.rpc.mockResolvedValue({ data: { itens: [], total: 0 }, error: null });
    const result = await listColaboradoresPageFromCloud();
    expect(result.total).toBe(0);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.clearIsoProJwtSession).not.toHaveBeenCalled();
  });

  it('planejamento total=0: uma RPC, sessao intacta', async () => {
    mocks.rpcSemFilaAuth.mockResolvedValue({ data: { documentos: [], total: 0, _source: 'tables' }, error: null });
    const result = await listDocumentosPlanejamentoPageFromCloud();
    expect(result.total).toBe(0);
    expect(mocks.rpcSemFilaAuth).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.clearIsoProJwtSession).not.toHaveBeenCalled();
  });

  it('pendentes de atendimento total=0: uma RPC, sessao intacta', async () => {
    mocks.rpc.mockResolvedValue({ data: { documentos: [], total: 0 }, error: null });
    const result = await listDocumentosPendentesAtendimentoFromCloud();
    expect(result.total).toBe(0);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.clearIsoProJwtSession).not.toHaveBeenCalled();
  });

  it('contagens a zeros (painel): uma RPC, sessao intacta', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        docsPendentes: 0,
        recebimentosAguardando: 0,
        conferenciaPendente: 0,
        inventariosAbertos: 0,
        rirAbertos: 0,
        rncAbertas: 0,
        _sourceDocs: 'tables',
      },
      error: null,
    });
    const result = await fetchOperacaoContagens();
    expect(result.docsPendentes).toBe(0);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.clearIsoProJwtSession).not.toHaveBeenCalled();
  });
});
