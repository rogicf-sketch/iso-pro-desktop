import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasSupabaseConfig: vi.fn(() => true),
  fetchOperacaoContagens: vi.fn(),
  collectAllPages: vi.fn(),
  getMobileDeviceIndicators: vi.fn(),
  getDesktopLicenseRegistrySummary: vi.fn(),
  listarDocumentos: vi.fn(),
  listarRecebimentos: vi.fn(),
  listarInventarios: vi.fn(),
  listarRir: vi.fn(),
  listarRnc: vi.fn(),
  listarMateriais: vi.fn(),
}));

vi.mock('../../../lib/supabase', () => ({
  hasSupabaseConfig: () => mocks.hasSupabaseConfig(),
}));

vi.mock('../../../lib/operacaoEscalaContagens', () => ({
  fetchOperacaoContagens: () => mocks.fetchOperacaoContagens(),
}));

vi.mock('../../../lib/collectAllPages', () => ({
  collectAllPages: (...args: unknown[]) => mocks.collectAllPages(...args),
}));

vi.mock('../../mobile/services/mobileDevices.service', () => ({
  getMobileDeviceIndicators: () => mocks.getMobileDeviceIndicators(),
}));

vi.mock('../../configuracoes/services/desktopLicenseRegistry.service', () => ({
  getDesktopLicenseRegistrySummary: () => mocks.getDesktopLicenseRegistrySummary(),
}));

vi.mock('../../documentos/services/documentos.service', () => ({
  listarDocumentos: (...args: unknown[]) => mocks.listarDocumentos(...args),
}));

vi.mock('../../recebimentos/services/recebimentos.service', () => ({
  listarRecebimentos: (...args: unknown[]) => mocks.listarRecebimentos(...args),
}));

vi.mock('../../inventario/services/inventario.service', () => ({
  listarInventarios: (...args: unknown[]) => mocks.listarInventarios(...args),
}));

vi.mock('../../qualidade/services/qualidade.service', () => ({
  listarRir: (...args: unknown[]) => mocks.listarRir(...args),
  listarRnc: (...args: unknown[]) => mocks.listarRnc(...args),
}));

vi.mock('../../materiais/services/materiais.service', () => ({
  listarMateriais: (...args: unknown[]) => mocks.listarMateriais(...args),
}));

import { listarResumosRelatorios } from './relatorios.service';

describe('listarResumosRelatorios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasSupabaseConfig.mockReturnValue(true);
    mocks.fetchOperacaoContagens.mockResolvedValue({
      docsPendentes: 3006,
      docsStatusPendente: 2000,
      docsStatusParcial: 1006,
      docsTotal: 4073,
      recebimentosAguardando: 0,
      conferenciaPendente: 0,
      recebimentosDivergentes: 0,
      inventariosAbertos: 2,
      inventariosComDivergencia: 0,
      inventarioDiasMaisAntigo: 0,
      rirAbertos: 5,
      rncAbertas: 2,
      rirReprovadoSemRnc: 0,
      sourceDocs: 'tables',
    });
    mocks.getMobileDeviceIndicators.mockResolvedValue({
      total: 9,
      autorizados: 8,
      pendentes: 1,
      bloqueados: 0,
    });
    mocks.getDesktopLicenseRegistrySummary.mockResolvedValue({
      data: { expired: 0, expiringSoon: 0, missingMachineLabel: 0 },
    });
  });

  it('na nuvem usa RPC de contagens e nao descarrega todas as paginas', async () => {
    const resumos = await listarResumosRelatorios();
    expect(mocks.fetchOperacaoContagens).toHaveBeenCalledTimes(1);
    expect(mocks.collectAllPages).not.toHaveBeenCalled();
    const planejamento = resumos.find((r) => r.categoria === 'planejamento');
    expect(planejamento?.valorDestaque).toBe('3006');
    expect(resumos.find((r) => r.categoria === 'estoque')?.valorDestaque).toBe('2');
    expect(resumos.find((r) => r.categoria === 'qualidade')?.valorDestaque).toBe('5 / 2');
  });
});
