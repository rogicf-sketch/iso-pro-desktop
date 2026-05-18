export type ConfiguracaoSecaoId = 'obra' | 'aparencia' | 'relatorios' | 'qualidade' | 'nuvem' | 'desktop' | 'manutencao';

export type ConfiguracaoSecaoMeta = {
  id: ConfiguracaoSecaoId;
  rotulo: string;
  resumo: string;
  /** Texto breve acima do conteúdo da aba activa. */
  intro: string;
  /** Só administradores de configurações. */
  adminOnly?: boolean;
};

export const CONFIGURACOES_SECOES: ConfiguracaoSecaoMeta[] = [
  {
    id: 'obra',
    rotulo: 'Obra',
    resumo: 'Cliente, projeto, ambiente no PC e rodapé nos impressos',
    intro: 'Contexto da obra, separação de dados por ambiente local e identificação nos relatórios impressos.',
  },
  {
    id: 'aparencia',
    rotulo: 'Interface',
    resumo: 'Tema, textos de ajuda e logo institucional',
    intro: 'Aspeto da aplicação para si e para a instalação, textos de ajuda e marca visual nos documentos HTML.',
  },
  {
    id: 'relatorios',
    rotulo: 'IA · relatórios',
    resumo: 'Análise assistida no relatório final (opcional)',
    intro: 'Credenciais OpenAI-compatíveis para síntese no Relatório Final de Obra. Opcional — o relatório funciona sem IA.',
    adminOnly: true,
  },
  {
    id: 'qualidade',
    rotulo: 'Qualidade',
    resumo: 'Numeração RIR e senhas RIR / RNC',
    intro: 'Formato dos números de RIR e senhas preferenciais usadas nos fluxos de qualidade.',
  },
  {
    id: 'nuvem',
    rotulo: 'Nuvem',
    resumo: 'Supabase, materiais e segredos de integração',
    intro: 'Projecto Supabase, sincronização de materiais e segredos para Edge Functions de utilizadores.',
    adminOnly: true,
  },
  {
    id: 'desktop',
    rotulo: 'Desktop',
    resumo: 'Máquina autorizada e licença do executável',
    intro: 'Vínculo de equipamento e token de licença do executável Windows.',
    adminOnly: true,
  },
  {
    id: 'manutencao',
    rotulo: 'Avançado',
    resumo: 'Backup, limpeza de cadastros e purge',
    intro: 'Backup local, limpeza de cadastros e purge na nuvem. Operações irreversíveis — use com cuidado.',
    adminOnly: true,
  },
];

export function isConfiguracaoSecaoId(v: string): v is ConfiguracaoSecaoId {
  return CONFIGURACOES_SECOES.some((s) => s.id === v);
}

export function listarSecoesConfiguracaoVisiveis(canAdminister: boolean): ConfiguracaoSecaoMeta[] {
  return CONFIGURACOES_SECOES.filter((s) => !s.adminOnly || canAdminister);
}

export function obterSecaoConfiguracao(id: ConfiguracaoSecaoId): ConfiguracaoSecaoMeta {
  return CONFIGURACOES_SECOES.find((s) => s.id === id) ?? CONFIGURACOES_SECOES[0];
}
