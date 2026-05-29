/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOGO_INSTITUCIONAL_PADRAO_FABRICA } from '../../../lib/logoInstitucional.constants';
import type { ConfiguracaoSistema } from '../types/configuracao.types';
import type { DesktopLicensePayload } from '../types/desktop-license.types';
import {
  evaluateDesktopBinding,
  extractDesktopLicensePayload,
  getDesktopLicenseHealth,
  getDesktopLicenseRegistryStatus,
  updateDesktopLicenseRegistryStatus,
  type DesktopSecurityContext,
} from './desktopSecurity.service';

const { mockHasSupabaseConfig, mockGetSupabase, mockReadConfiguracoes } = vi.hoisted(() => ({
  mockHasSupabaseConfig: vi.fn(() => false),
  mockGetSupabase: vi.fn(),
  mockReadConfiguracoes: vi.fn(),
}));

vi.mock('../../../lib/supabase', () => ({
  hasSupabaseConfig: () => mockHasSupabaseConfig(),
  getSupabase: () => mockGetSupabase(),
}));

vi.mock('./configuracoes.service', () => ({
  readConfiguracoes: () => mockReadConfiguracoes(),
}));

const BASE_CONFIG: ConfiguracaoSistema = {
  cliente: '',
  projeto: '',
  contrato: '',
  local: '',
  tema: 'neon',
  mostrarAjudaModulos: true,
  sequenciaAtendimento: 0,
  rirModoNumeracao: 'auto',
  rirProcedimentosCadastro: [],
  rirPrefSenha: '',
  rncPrefSenha: '',
  materiaisNuvem: false,
  supabaseUrl: '',
  supabaseAnonKey: '',
  isoProLinkAuthSecret: '',
  isoProAdminUserSecret: '',
  desktopVinculoAtivo: false,
  desktopInstalacaoAutorizadaId: '',
  desktopInstalacaoAutorizadaNome: '',
  desktopUltimaValidacaoEm: '',
  desktopLicencaToken: '',
  desktopLicencaEmitidaPara: '',
  desktopLicencaExpiraEm: '',
  logoInstitucionalUrl: LOGO_INSTITUCIONAL_PADRAO_FABRICA,
  documentoRodapeNome: '',
  documentoRodapeCnpj: '',
  relatorioFinalIaHabilitado: false,
  relatorioFinalIaApiKey: '',
  relatorioFinalIaModelo: 'gpt-4o-mini',
  relatorioFinalIaBaseUrl: 'https://api.openai.com/v1',
  alertaEstoqueEmailHabilitado: false,
  alertaEstoqueEmailDestinatarios: '',
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  smtpUsuario: '',
  smtpSenha: '',
  smtpRemetente: '',
  backupOracleAutomaticoHabilitado: true,
  backupOracleIntervaloRotinaDias: 7,
  backupOracleIntervaloFluxoAltoDias: 3,
  backupOracleMinAtendimentosFluxo: 10,
  backupOracleMinRecebimentosFluxo: 3,
  backupOracleMinCadastrosFluxo: 5,
};

function base64UrlJson(obj: DesktopLicensePayload) {
  const raw = btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `${raw}.unused-signature-part`;
}

function minimalPayload(overrides: Partial<DesktopLicensePayload> = {}): DesktopLicensePayload {
  return {
    licenseId: 'lic-1',
    issuedTo: 'admin@empresa',
    machineFingerprint: 'fp-abc',
    issuedAt: '2026-01-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('desktopSecurity.service', () => {
  beforeEach(() => {
    mockHasSupabaseConfig.mockReturnValue(false);
    mockGetSupabase.mockReturnValue(null);
    mockReadConfiguracoes.mockImplementation(() => ({ ...BASE_CONFIG }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    delete window.isoProDesktop;
  });

  describe('extractDesktopLicensePayload', () => {
    it('retorna null para token vazio ou formato invalido', () => {
      expect(extractDesktopLicensePayload('')).toBeNull();
      expect(extractDesktopLicensePayload('so-uma-parte')).toBeNull();
      expect(extractDesktopLicensePayload('a.b.c')).toBeNull();
    });

    it('retorna null quando o payload nao e JSON valido', () => {
      const bad = `${btoa('not json').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}.x`;
      expect(extractDesktopLicensePayload(bad)).toBeNull();
    });

    it('extrai o payload de um token com duas partes base64url', () => {
      const payload = minimalPayload({ licenseId: 'id-42' });
      const token = base64UrlJson(payload);
      expect(extractDesktopLicensePayload(token)).toEqual(payload);
    });
  });

  describe('getDesktopLicenseHealth', () => {
    it('sem expiresAt: hasLicense reflete existencia do payload', () => {
      const token = base64UrlJson(minimalPayload());
      const h = getDesktopLicenseHealth(token);
      expect(h.hasLicense).toBe(true);
      expect(h.expiresAt).toBe('');
      expect(h.isExpired).toBe(false);
      expect(h.expiresSoon).toBe(false);
      expect(h.daysUntilExpiration).toBeNull();
    });

    it('com expiresAt invalida: nao marca expirado', () => {
      const token = base64UrlJson(minimalPayload({ expiresAt: 'data-invalida' }));
      const h = getDesktopLicenseHealth(token);
      expect(h.hasLicense).toBe(true);
      expect(h.isExpired).toBe(false);
    });

    it('com expiresAt no passado: isExpired true', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
      const token = base64UrlJson(minimalPayload({ expiresAt: '2026-06-01T00:00:00.000Z' }));
      const h = getDesktopLicenseHealth(token);
      expect(h.isExpired).toBe(true);
      expect(h.expiresSoon).toBe(false);
    });

    it('com expiresAt dentro de 30 dias: expiresSoon true', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-01T12:00:00.000Z'));
      const token = base64UrlJson(minimalPayload({ expiresAt: '2026-06-20T00:00:00.000Z' }));
      const h = getDesktopLicenseHealth(token);
      expect(h.isExpired).toBe(false);
      expect(h.expiresSoon).toBe(true);
      expect(h.daysUntilExpiration).toBeGreaterThan(0);
    });
  });

  describe('getDesktopLicenseRegistryStatus', () => {
    it('falha sem licenseId no payload', async () => {
      const token = base64UrlJson(minimalPayload({ licenseId: '' }));
      const r = await getDesktopLicenseRegistryStatus(token);
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/identificador valido/i);
    });

    it('sem Supabase configurado retorna unavailable', async () => {
      mockHasSupabaseConfig.mockReturnValue(false);
      const token = base64UrlJson(minimalPayload());
      const r = await getDesktopLicenseRegistryStatus(token);
      expect(r.success).toBe(true);
      expect(r.data).toBe('unavailable');
      expect(r.meta?.source).toBe('local');
    });

    it('consulta Supabase e retorna active', async () => {
      mockHasSupabaseConfig.mockReturnValue(true);
      mockGetSupabase.mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { status: 'active' }, error: null }),
              }),
            }),
          }),
        }),
      });
      const token = base64UrlJson(minimalPayload({ licenseId: 'L1' }));
      const r = await getDesktopLicenseRegistryStatus(token);
      expect(r.success).toBe(true);
      expect(r.data).toBe('active');
    });

    it('consulta Supabase e retorna revoked', async () => {
      mockHasSupabaseConfig.mockReturnValue(true);
      mockGetSupabase.mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { status: 'revoked' }, error: null }),
              }),
            }),
          }),
        }),
      });
      const token = base64UrlJson(minimalPayload());
      const r = await getDesktopLicenseRegistryStatus(token);
      expect(r.data).toBe('revoked');
    });

    it('sem linha no banco retorna not_found', async () => {
      mockHasSupabaseConfig.mockReturnValue(true);
      mockGetSupabase.mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      });
      const r = await getDesktopLicenseRegistryStatus(base64UrlJson(minimalPayload()));
      expect(r.data).toBe('not_found');
    });

    it('em erro de query retorna unavailable', async () => {
      mockHasSupabaseConfig.mockReturnValue(true);
      mockGetSupabase.mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
              }),
            }),
          }),
        }),
      });
      const r = await getDesktopLicenseRegistryStatus(base64UrlJson(minimalPayload()));
      expect(r.data).toBe('unavailable');
    });
  });

  describe('updateDesktopLicenseRegistryStatus', () => {
    it('falha sem licenseId no token', async () => {
      const token = base64UrlJson(minimalPayload({ licenseId: '' }));
      const r = await updateDesktopLicenseRegistryStatus(token, 'active');
      expect(r.success).toBe(false);
    });

    it('falha sem Supabase', async () => {
      mockHasSupabaseConfig.mockReturnValue(false);
      const r = await updateDesktopLicenseRegistryStatus(base64UrlJson(minimalPayload()), 'revoked');
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/Supabase indisponivel/i);
    });

    it('upsert bem-sucedido retorna o status', async () => {
      mockHasSupabaseConfig.mockReturnValue(true);
      mockGetSupabase.mockReturnValue({
        from: vi.fn().mockReturnValue({
          upsert: vi.fn().mockResolvedValue({ error: null }),
        }),
      });
      const r = await updateDesktopLicenseRegistryStatus(base64UrlJson(minimalPayload()), 'active');
      expect(r.success).toBe(true);
      expect(r.data).toBe('active');
    });

    it('upsert com erro retorna falha', async () => {
      mockHasSupabaseConfig.mockReturnValue(true);
      mockGetSupabase.mockReturnValue({
        from: vi.fn().mockReturnValue({
          upsert: vi.fn().mockResolvedValue({ error: { message: 'db' } }),
        }),
      });
      const r = await updateDesktopLicenseRegistryStatus(base64UrlJson(minimalPayload()), 'revoked');
      expect(r.success).toBe(false);
    });
  });

  describe('evaluateDesktopBinding', () => {
    const context: DesktopSecurityContext = {
      isElectron: true,
      machineFingerprint: 'fp-test',
      machineLabel: 'Equipamento-teste',
      appVersion: '0.1.0',
    };

    beforeEach(() => {
      window.isoProDesktop = { platform: 'desktop', version: '0.1.0' };
    });

    it('nao bloqueia com vinculo desktop desativado', async () => {
      mockReadConfiguracoes.mockImplementation(() => ({
        ...BASE_CONFIG,
        desktopVinculoAtivo: false,
        desktopInstalacaoAutorizadaId: context.machineFingerprint,
      }));
      const r = await evaluateDesktopBinding(context);
      expect(r.blocked).toBe(false);
    });

    it('nao bloqueia fora do runtime desktop (sem isoProDesktop)', async () => {
      mockReadConfiguracoes.mockImplementation(() => ({
        ...BASE_CONFIG,
        desktopVinculoAtivo: true,
        desktopInstalacaoAutorizadaId: context.machineFingerprint,
      }));
      delete window.isoProDesktop;
      const r = await evaluateDesktopBinding(context);
      expect(r.blocked).toBe(false);
    });

    it('bloqueia sem contexto de seguranca', async () => {
      mockReadConfiguracoes.mockImplementation(() => ({
        ...BASE_CONFIG,
        desktopVinculoAtivo: true,
        desktopInstalacaoAutorizadaId: context.machineFingerprint,
      }));
      const r = await evaluateDesktopBinding(null);
      expect(r.blocked).toBe(true);
      expect(r.reason).toMatch(/identidade desta instalacao desktop/i);
    });

    it('bloqueia quando isElectron e falso', async () => {
      mockReadConfiguracoes.mockImplementation(() => ({
        ...BASE_CONFIG,
        desktopVinculoAtivo: true,
        desktopInstalacaoAutorizadaId: context.machineFingerprint,
      }));
      const r = await evaluateDesktopBinding({ ...context, isElectron: false });
      expect(r.blocked).toBe(true);
    });

    it('bloqueia sem identificacao autorizada', async () => {
      mockReadConfiguracoes.mockImplementation(() => ({
        ...BASE_CONFIG,
        desktopVinculoAtivo: true,
        desktopInstalacaoAutorizadaId: '',
      }));
      const r = await evaluateDesktopBinding(context);
      expect(r.blocked).toBe(true);
      expect(r.reason).toMatch(/sem identificacao autorizada/i);
    });

    it('bloqueia quando a maquina nao confere', async () => {
      mockReadConfiguracoes.mockImplementation(() => ({
        ...BASE_CONFIG,
        desktopVinculoAtivo: true,
        desktopInstalacaoAutorizadaId: 'outro-fp',
        desktopInstalacaoAutorizadaNome: 'Outro PC',
      }));
      const r = await evaluateDesktopBinding(context);
      expect(r.blocked).toBe(true);
      expect(r.reason).toMatch(/nao corresponde ao equipamento autorizado/i);
    });

    it('bloqueia token de licenca em formato invalido', async () => {
      mockReadConfiguracoes.mockImplementation(() => ({
        ...BASE_CONFIG,
        desktopVinculoAtivo: true,
        desktopInstalacaoAutorizadaId: context.machineFingerprint,
        desktopUltimaValidacaoEm: new Date().toISOString(),
        desktopLicencaToken: 'token-invalido',
        desktopLicencaEmitidaPara: 'admin',
      }));
      const r = await evaluateDesktopBinding(context);
      expect(r.blocked).toBe(true);
      expect(r.reason).toMatch(/formato invalido/i);
    });

    it('bloqueia licenca com assinatura invalida (payload parseavel)', async () => {
      const payload = minimalPayload({
        machineFingerprint: context.machineFingerprint,
        issuedTo: 'titular@ok',
      });
      const token = base64UrlJson(payload);
      mockReadConfiguracoes.mockImplementation(() => ({
        ...BASE_CONFIG,
        desktopVinculoAtivo: true,
        desktopInstalacaoAutorizadaId: context.machineFingerprint,
        desktopUltimaValidacaoEm: new Date().toISOString(),
        desktopLicencaToken: token,
        desktopLicencaEmitidaPara: 'titular@ok',
        desktopLicencaExpiraEm: '',
      }));
      const r = await evaluateDesktopBinding(context);
      expect(r.blocked).toBe(true);
      expect(r.reason).toMatch(/assinatura criptografica/i);
    });

    it('permite acesso sem licenca quando validacao recente', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-02T12:00:00.000Z'));
      mockReadConfiguracoes.mockImplementation(() => ({
        ...BASE_CONFIG,
        desktopVinculoAtivo: true,
        desktopInstalacaoAutorizadaId: context.machineFingerprint,
        desktopUltimaValidacaoEm: '2026-06-01T12:00:00.000Z',
        desktopLicencaToken: '',
      }));
      const r = await evaluateDesktopBinding(context);
      expect(r.blocked).toBe(false);
    });

    it('bloqueia quando a ultima validacao esta expirada', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));
      mockReadConfiguracoes.mockImplementation(() => ({
        ...BASE_CONFIG,
        desktopVinculoAtivo: true,
        desktopInstalacaoAutorizadaId: context.machineFingerprint,
        desktopUltimaValidacaoEm: '2026-06-01T12:00:00.000Z',
        desktopLicencaToken: '',
      }));
      const r = await evaluateDesktopBinding(context);
      expect(r.blocked).toBe(true);
      expect(r.reason).toMatch(/vinculacao desta instalacao expirou/i);
    });
  });
});
