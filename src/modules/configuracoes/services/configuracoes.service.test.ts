/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as authService from '../../auth/services/auth.service';

vi.mock('../../../lib/supabase', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../lib/supabase')>();
  return {
    ...mod,
    hasSupabaseConfig: vi.fn(() => false),
  };
});

vi.mock('./syncAlertaEstoqueConfigNuvem.service', () => ({
  sincronizarConfigAlertaEstoqueParaNuvem: vi.fn(() =>
    Promise.resolve({ success: true, data: { sincronizado: false } }),
  ),
}));
import { LOGO_INSTITUCIONAL_PADRAO_FABRICA } from '../../../lib/logoInstitucional.constants';
import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';
import { hasSupabaseConfig } from '../../../lib/supabase';
import {
  aplicarTemaEfetivoNaSessao,
  limparUsuarioTemaPreferido,
  readConfiguracoes,
  readTemaEfetivoParaSessao,
  readUsuarioTemaPreferido,
  salvarConfiguracoes,
  salvarUsuarioTemaPreferido,
} from './configuracoes.service';
import { sincronizarConfigAlertaEstoqueParaNuvem } from './syncAlertaEstoqueConfigNuvem.service';
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

  it('retorna info quando sync na nuvem conclui com sucesso', async () => {
    vi.mocked(hasSupabaseConfig).mockReturnValueOnce(true);
    vi.mocked(sincronizarConfigAlertaEstoqueParaNuvem).mockResolvedValueOnce({
      success: true,
      data: { sincronizado: true },
    });
    const saved = await salvarConfiguracoes(basePayload({ cliente: 'Cliente sync ok' }));
    expect(saved.success).toBe(true);
    expect(saved.info).toContain('nuvem');
    expect(saved.warning).toBeUndefined();
  });

  it('retorna warning quando sync na nuvem falha mas gravacao local ok', async () => {
    vi.mocked(hasSupabaseConfig).mockReturnValueOnce(true);
    vi.mocked(sincronizarConfigAlertaEstoqueParaNuvem).mockResolvedValueOnce({
      success: false,
      error: 'Rede indisponivel',
    });
    const saved = await salvarConfiguracoes(basePayload({ cliente: 'Cliente sync' }));
    expect(saved.success).toBe(true);
    expect(saved.warning).toContain('Rede indisponivel');
    expect(readConfiguracoes().cliente).toBe('Cliente sync');
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
    salvarUsuarioTemaPreferido('hibrido');
    expect(readUsuarioTemaPreferido()).toBe('hibrido');
    expect(readTemaEfetivoParaSessao()).toBe('hibrido');
    limparUsuarioTemaPreferido();
    expect(readUsuarioTemaPreferido()).toBeNull();
    expect(readTemaEfetivoParaSessao()).toBe(readConfiguracoes().tema);
  });

  it('migra tema legado claro para hibrido na preferencia pessoal', () => {
    const key = getScopedIsoProStorageKey('iso-pro-desktop-usuario-tema-ana');
    localStorage.setItem(key, 'claro');
    expect(readUsuarioTemaPreferido()).toBe('hibrido');
    expect(readTemaEfetivoParaSessao()).toBe('hibrido');
  });

  it('sem sessao, tema hibrido nao vai para o login (aplica escuro campo)', () => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...readConfiguracoes(), tema: 'hibrido' }));
    vi.spyOn(authService, 'getCurrentUser').mockReturnValue(null);
    aplicarTemaEfetivoNaSessao();
    expect(document.body.classList.contains('theme-campo')).toBe(true);
    expect(document.body.classList.contains('theme-hibrido')).toBe(false);
  });

  it('com sessao, tema hibrido continua a valer', () => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...readConfiguracoes(), tema: 'hibrido' }));
    aplicarTemaEfetivoNaSessao();
    expect(document.body.classList.contains('theme-hibrido')).toBe(true);
  });
});
