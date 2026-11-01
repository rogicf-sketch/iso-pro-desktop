import { describe, expect, it } from 'vitest';
import {
  aplicarConfigOperacionalDoSnapshot,
  extrairConfigOperacionalParaSnapshot,
  localConfigOperacionalVazioParaHydrate,
  nuvemConfigOperacionalMaisRecente,
  parseProcedimentoTextoParaCadastro,
  reconstruirProcedimentosCadastroDeTextos,
} from './configOperacionalSnapshot';
import type { ConfiguracaoSistema } from '../types/configuracao.types';

function baseConfig(over: Partial<ConfiguracaoSistema> = {}): ConfiguracaoSistema {
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
    relatorioFinalIaModelo: 'gpt-4o-mini',
    relatorioFinalIaBaseUrl: 'https://api.openai.com/v1',
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

describe('configOperacionalSnapshot', () => {
  it('extrai procedimentos RIR para a nuvem', () => {
    const cfg = baseConfig({
      cliente: 'Acme',
      rirProcedimentosCadastro: [
        { id: '1', base: 'PE-TUB-003', revisao: 'REV.2', atualizadoEm: '2026-04-17' },
      ],
    });
    const snap = extrairConfigOperacionalParaSnapshot(cfg, { atualizadoEm: '2026-07-24T12:00:00.000Z' });
    expect(snap.cliente).toBe('Acme');
    expect(snap.rirProcedimentosCadastro).toHaveLength(1);
    expect(snap.configOperacionalAtualizadoEm).toBe('2026-07-24T12:00:00.000Z');
  });

  it('nao envia segredos Edge no snapshot operacional', () => {
    const cfg = baseConfig({
      isoProAdminUserSecret: 'admin-secret',
      isoProLinkAuthSecret: 'link-secret',
    });
    const snap = extrairConfigOperacionalParaSnapshot(cfg);
    expect(snap).not.toHaveProperty('isoProAdminUserSecret');
    expect(snap).not.toHaveProperty('isoProLinkAuthSecret');
    const next = aplicarConfigOperacionalDoSnapshot(baseConfig({ isoProAdminUserSecret: 'local' }), {
      // @ts-expect-error legado na nuvem — ignorar
      isoProAdminUserSecret: 'from-cloud',
    });
    expect(next.isoProAdminUserSecret).toBe('local');
  });

  it('aplica nuvem sobre local vazio', () => {
    const local = baseConfig();
    expect(localConfigOperacionalVazioParaHydrate(local)).toBe(true);
    const next = aplicarConfigOperacionalDoSnapshot(local, {
      cliente: 'Obra',
      projeto: 'X',
      rirProcedimentosCadastro: [
        { id: '1', base: 'PE-ELE-001', revisao: 'REV.1', atualizadoEm: '2026-04-17' },
      ],
    });
    expect(next.cliente).toBe('Obra');
    expect(next.rirProcedimentosCadastro[0]?.base).toBe('PE-ELE-001');
  });

  it('LWW por timestamp', () => {
    expect(nuvemConfigOperacionalMaisRecente('', '2026-07-24T10:00:00.000Z')).toBe(true);
    expect(
      nuvemConfigOperacionalMaisRecente('2026-07-24T12:00:00.000Z', '2026-07-24T10:00:00.000Z'),
    ).toBe(false);
    expect(
      nuvemConfigOperacionalMaisRecente('2026-07-24T10:00:00.000Z', '2026-07-24T12:00:00.000Z'),
    ).toBe(true);
  });

  it('nao apaga procedimentos locais quando a nuvem manda lista vazia', () => {
    const local = baseConfig({
      cliente: 'Obra',
      rirProcedimentosCadastro: [
        { id: '1', base: 'PE-TUB-003', revisao: 'REV.2', atualizadoEm: '2026-04-17' },
      ],
    });
    const next = aplicarConfigOperacionalDoSnapshot(local, {
      cliente: 'Obra',
      rirProcedimentosCadastro: [],
    });
    expect(next.rirProcedimentosCadastro).toHaveLength(1);
    expect(next.rirProcedimentosCadastro[0]?.base).toBe('PE-TUB-003');
  });

  it('reconstrói catálogo a partir de textos de RIR', () => {
    expect(parseProcedimentoTextoParaCadastro('PE-TUB-003 REV.2')).toEqual({
      base: 'PE-TUB-003',
      revisao: 'REV.2',
    });
    const lista = reconstruirProcedimentosCadastroDeTextos(
      ['PE-TUB-003 REV.2', 'PE-TUB-003 REV.2', 'PE-ELE-001 REV.1', ''],
      '2026-08-31T12:00:00.000Z',
    );
    expect(lista).toHaveLength(2);
    expect(lista.map((p) => p.base).sort()).toEqual(['PE-ELE-001', 'PE-TUB-003']);
  });
});
