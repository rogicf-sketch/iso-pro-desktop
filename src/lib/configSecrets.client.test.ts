/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ConfiguracaoSistema } from '@/modules/configuracoes/types/configuracao.types';
import {
  hydrateConfigSecretsVault,
  mergeConfigSecrets,
  persistConfigSecretsVault,
  resetConfigSecretsClientForTests,
} from './configSecrets.client';

function base(over: Partial<ConfiguracaoSistema> = {}): ConfiguracaoSistema {
  return {
    cliente: '',
    projeto: '',
    contrato: '',
    local: '',
    tema: 'campo',
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
    logoInstitucionalUrl: '/logo.svg',
  logoInstitucionalTamanhoRelatorio: 'auto',
  logoInstitucionalFormatoQuadro: 'auto',
  logoInstitucionalAspecto: 0,
  logoInstitucionalZoomPct: 100,
    documentoRodapeNome: '',
    documentoRodapeCnpj: '',
    relatorioFinalIaHabilitado: false,
    relatorioFinalIaApiKey: '',
    relatorioFinalIaModelo: '',
    relatorioFinalIaBaseUrl: '',
    alertaEstoqueEmailHabilitado: false,
    alertaEstoqueEmailDestinatarios: '',
    alertaOperacionalEmailHabilitado: false,
    alertaOperacionalEmailDestinatarios: '',
    alertaOperacionalConferenciaHabilitado: true,
    alertaOperacionalConferenciaPrazoDias: 2,
    alertaOperacionalRirHabilitado: true,
    alertaOperacionalRirPrazoDias: 5,
    alertaOperacionalRncHabilitado: true,
    alertaOperacionalRncPrazoDias: 7,
    alertaOperacionalInventarioHabilitado: false,
    alertaOperacionalInventarioPrazoDias: 7,
    alertaOperacionalIntervaloMinimoHoras: 24,
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    smtpUsuario: '',
    smtpSenha: '',
    smtpRemetente: '',
    backupOracleAutomaticoHabilitado: false,
    backupOracleIntervaloRotinaDias: 7,
    backupOracleIntervaloFluxoAltoDias: 3,
    backupOracleMinAtendimentosFluxo: 1,
    backupOracleMinRecebimentosFluxo: 1,
    backupOracleMinCadastrosFluxo: 1,
    pdfNuvemHabilitado: true,
    pdfNuvemTimeoutSegundos: 90,
    ...over,
  } as ConfiguracaoSistema;
}

describe('configSecrets.client (web)', () => {
  beforeEach(() => {
    resetConfigSecretsClientForTests();
  });

  afterEach(() => {
    resetConfigSecretsClientForTests();
  });

  it('strip no persist e merge a partir da sessão', async () => {
    const stripped = await persistConfigSecretsVault(
      base({ isoProAdminUserSecret: 's3cret', isoProLinkAuthSecret: 'link' }),
    );
    expect(stripped.isoProAdminUserSecret).toBe('');
    expect(stripped.isoProLinkAuthSecret).toBe('');
    expect(mergeConfigSecrets(stripped).isoProAdminUserSecret).toBe('s3cret');
    expect(sessionStorage.getItem('iso-pro-config-secrets-session-v1')).toContain('s3cret');
  });

  it('migra plaintext legado do localStorage e marca migrated', async () => {
    const { migrated } = await hydrateConfigSecretsVault(
      base({ isoProAdminUserSecret: 'legado' }),
    );
    expect(migrated).toBe(true);
    expect(mergeConfigSecrets(base()).isoProAdminUserSecret).toBe('legado');
  });
});
