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
  /** Quando falso, oculta blocos explicativos longos nos modulos (CSV, regras descritivas). */
  mostrarAjudaModulos: boolean;
  sequenciaAtendimento: number;
  rirModoNumeracao: 'auto' | 'disciplina' | 'manual';
  /** Lista para datalist / historico do Nº Procedimento no RIR. */
  rirProcedimentosCadastro: RirProcedimentoCadastroItem[];
  rirPrefSenha: string;
  rncPrefSenha: string;
  materiaisNuvem: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
  /**
   * Segredo partilhado com a Edge Function `iso_pro_link_auth_user` (Dashboard: ISO_PRO_LINK_AUTH_SECRET).
   * Gravado apenas em máquinas de administrador de confiança; equivale em sensibilidade à chave anon.
   */
  isoProLinkAuthSecret: string;
  /**
   * Segredo partilhado com a Edge Function `iso_pro_admin_user` (Dashboard: ISO_PRO_ADMIN_USER_SECRET).
   * Quando preenchido, criar/editar utilizadores na nuvem usa a funcao em vez de insert/update directo com a anon key.
   */
  isoProAdminUserSecret: string;
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
  /**
   * Rodape institucional nos documentos HTML (relatorio fotografico, RIR, RNC, recibos).
   * Em geral o nome da empresa que opera no sistema (razao social ou fantasia).
   */
  documentoRodapeNome: string;
  /** CNPJ da empresa no rodape dos relatórios; pode incluir pontuacao, ex.: 00.000.000/0001-00. */
  documentoRodapeCnpj: string;
  /**
   * Relatório Final de Obra: análise assistida por API (OpenAI-compatível).
   * Dados da obra são enviados ao provedor configurado com a chave do cliente.
   */
  relatorioFinalIaHabilitado: boolean;
  relatorioFinalIaApiKey: string;
  /** Ex.: gpt-4o-mini, claude-3-5-haiku-20241022 (se o endpoint suportar). */
  relatorioFinalIaModelo: string;
  /** Base da API sem barra final, ex.: https://api.openai.com/v1 */
  relatorioFinalIaBaseUrl: string;
  /** E-mail automatico quando materiais entram em estoque CRITICO (app desktop). */
  alertaEstoqueEmailHabilitado: boolean;
  /** Destinatarios separados por virgula ou ponto-e-virgula. */
  alertaEstoqueEmailDestinatarios: string;
  /** E-mail automatico para pendencias operacionais (conferencia, RIR, RNC, inventario). */
  alertaOperacionalEmailHabilitado: boolean;
  alertaOperacionalEmailDestinatarios: string;
  alertaOperacionalConferenciaHabilitado: boolean;
  /** Dias corridos desde a data do recebimento. */
  alertaOperacionalConferenciaPrazoDias: number;
  alertaOperacionalRirHabilitado: boolean;
  alertaOperacionalRirPrazoDias: number;
  alertaOperacionalRncHabilitado: boolean;
  alertaOperacionalRncPrazoDias: number;
  alertaOperacionalInventarioHabilitado: boolean;
  alertaOperacionalInventarioPrazoDias: number;
  /** Minimo entre reenvios quando a lista de pendencias nao muda (horas). */
  alertaOperacionalIntervaloMinimoHoras: number;
  smtpHost: string;
  smtpPort: number;
  /** true = TLS directo (ex. porta 465); false = STARTTLS (ex. 587). */
  smtpSecure: boolean;
  smtpUsuario: string;
  smtpSenha: string;
  /** Remetente, ex.: ISO PRO Alertas <alertas@empresa.com> */
  smtpRemetente: string;
  /** Backup automatico do snapshot para Oracle Object Storage (app desktop). */
  backupOracleAutomaticoHabilitado: boolean;
  /** Dias entre backups de rotina (ex.: 7 = ~1x por semana). */
  backupOracleIntervaloRotinaDias: number;
  /** Com fluxo alto, intervalo minimo em dias (ex.: 3). */
  backupOracleIntervaloFluxoAltoDias: number;
  backupOracleMinAtendimentosFluxo: number;
  backupOracleMinRecebimentosFluxo: number;
  backupOracleMinCadastrosFluxo: number;
};
