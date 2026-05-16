/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as authService from '../../auth/services/auth.service';
import { LOGO_INSTITUCIONAL_PADRAO_FABRICA } from '../../../lib/logoInstitucional.constants';
import {
  limparUsuarioTemaPreferido,
  readConfiguracoes,
  readTemaEfetivoParaSessao,
  readUsuarioTemaPreferido,
  salvarConfiguracoes,
  salvarUsuarioTemaPreferido,
} from './configuracoes.service';
import type { ConfiguracaoSistema } from '../types/configuracao.types';

const CONFIG_KEY = 'iso-pro-desktop-configuracoes-sistema';

function basePayload(overrides: Partial<ConfiguracaoSistema> = {}): ConfiguracaoSistema {
  const cur = readConfiguracoes();
  return {
    ...cur,
    cliente: 'c',
    projeto: 'p',
    contrato: 'ct',
    local: 'l',
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
    ...overrides,
  };
}

describe('configuracoes.service — isoProAdminUserSecret', () => {
  beforeEach(() => {
    localStorage.removeItem(CONFIG_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(CONFIG_KEY);
  });

  it('persiste e faz trim de isoProAdminUserSecret', async () => {
    const payload = basePayload({
      isoProAdminUserSecret: '  segredo-admin-edge  ',
    });
    const saved = await salvarConfiguracoes(payload);
    expect(saved.success).toBe(true);
    expect(readConfiguracoes().isoProAdminUserSecret).toBe('segredo-admin-edge');
  });
});

describe('configuracoes.service — isoProLinkAuthSecret', () => {
  beforeEach(() => {
    localStorage.removeItem(CONFIG_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(CONFIG_KEY);
  });

  it('persiste e faz trim de isoProLinkAuthSecret', async () => {
    const payload = basePayload({
      isoProLinkAuthSecret: '  segredo-compartilhado  ',
    });
    const saved = await salvarConfiguracoes(payload);
    expect(saved.success).toBe(true);
    expect(readConfiguracoes().isoProLinkAuthSecret).toBe('segredo-compartilhado');
  });

  it('readConfiguracoes usa string vazia quando chave ausente no JSON antigo', () => {
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({
        cliente: 'x',
        projeto: 'y',
        contrato: 'z',
        local: 'w',
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
      }),
    );
    expect(readConfiguracoes().isoProLinkAuthSecret).toBe('');
  });
});

describe('configuracoes.service — tema preferido do utilizador', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(authService, 'getCurrentUser').mockReturnValue({
      id: 'u1',
      login: 'ana',
      nome: 'Ana',
      perfil: { id: 'p1', nome: 'Operador' },
      permissoes: [],
    });
    readConfiguracoes();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('readTemaEfetivo usa tema da instalacao quando nao ha preferencia', () => {
    const instalacao = readConfiguracoes().tema;
    expect(readUsuarioTemaPreferido()).toBeNull();
    expect(readTemaEfetivoParaSessao()).toBe(instalacao);
  });

  it('preferencia pessoal sobrepoe tema da instalacao e limpar volta ao padrao', () => {
    salvarUsuarioTemaPreferido('claro');
    expect(readUsuarioTemaPreferido()).toBe('claro');
    expect(readTemaEfetivoParaSessao()).toBe('claro');
    limparUsuarioTemaPreferido();
    expect(readUsuarioTemaPreferido()).toBeNull();
    expect(readTemaEfetivoParaSessao()).toBe(readConfiguracoes().tema);
  });
});
