/** Cadastro de procedimentos para sugestao no campo Nº Procedimento do RIR (base + revisao). */
export type RirProcedimentoCadastroItem = {
  id: string;
  base: string;
  revisao: string;
  atualizadoEm: string;
};

export type ConfiguracaoSistema = {
  cliente: string;
  projeto: string;
  contrato: string;
  local: string;
  tema: 'padrao' | 'escuro' | 'claro' | 'verde' | 'neon';
  sequenciaAtendimento: number;
  rirModoNumeracao: 'auto' | 'disciplina' | 'manual';
  /** Lista para datalist / historico do Nº Procedimento no RIR. */
  rirProcedimentosCadastro: RirProcedimentoCadastroItem[];
  rirPrefSenha: string;
  rncPrefSenha: string;
  materiaisNuvem: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
  desktopVinculoAtivo: boolean;
  desktopInstalacaoAutorizadaId: string;
  desktopInstalacaoAutorizadaNome: string;
  desktopUltimaValidacaoEm: string;
  desktopLicencaToken: string;
  desktopLicencaEmitidaPara: string;
  desktopLicencaExpiraEm: string;
  /**
   * Logo institucional em relatorios impressos (recibo, RIR, RNC, etiquetas).
   * Caminho em `public`, URL absoluta ou `data:image/...` (upload em Configuracoes).
   */
  logoInstitucionalUrl: string;
};
