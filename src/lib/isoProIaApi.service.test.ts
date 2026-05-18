import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConfiguracaoSistema } from '../modules/configuracoes/types/configuracao.types';
import { credenciaisIaFromConfiguracao, normalizeIaApiBaseUrl, testarConexaoIaApi } from './isoProIaApi.service';

function cfgMinima(overrides: Partial<ConfiguracaoSistema> = {}): ConfiguracaoSistema {
  return {
    cliente: '',
    projeto: '',
    contrato: '',
    local: '',
    tema: 'padrao',
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
    logoInstitucionalUrl: '/logo.png',
    documentoRodapeNome: '',
    documentoRodapeCnpj: '',
    relatorioFinalIaHabilitado: true,
    relatorioFinalIaApiKey: 'sk-test-12345678',
    relatorioFinalIaModelo: 'gpt-4o-mini',
    relatorioFinalIaBaseUrl: 'https://api.openai.com/v1',
    ...overrides,
  };
}

describe('isoProIaApi.service', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizeIaApiBaseUrl corrige OpenRouter e Free The AI sem path /v1', () => {
    expect(normalizeIaApiBaseUrl('https://openrouter.ai')).toBe('https://openrouter.ai/api/v1');
    expect(normalizeIaApiBaseUrl('https://freetheai.xyz')).toBe('https://api.freetheai.xyz/v1');
  });

  it('credenciaisIaFromConfiguracao normaliza URL e modelo padrão', () => {
    const c = credenciaisIaFromConfiguracao(
      cfgMinima({ relatorioFinalIaBaseUrl: 'https://api.example.com/v1/', relatorioFinalIaModelo: '' }),
    );
    expect(c.baseUrl).toBe('https://api.example.com/v1');
    expect(c.modelo).toBe('gpt-4o-mini');
  });

  it('testarConexaoIaApi falha sem chave', async () => {
    const r = await testarConexaoIaApi(cfgMinima({ relatorioFinalIaApiKey: '' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain('chave');
  });

  it('testarConexaoIaApi sucesso com fetch mockado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'OK' } }] }),
      }),
    );

    const r = await testarConexaoIaApi(cfgMinima());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.modelo).toBe('gpt-4o-mini');
      expect(r.data.respostaAmostra).toBe('OK');
    }
  });
});
