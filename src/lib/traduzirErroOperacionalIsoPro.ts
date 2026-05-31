/** Mensagem padrao quando a leitura remota falha em modo nuvem. */
export const MSG_ERRO_LEITURA_NUVEM =
  'Nao foi possivel ler a nuvem; verifique ligacao, URL/chave em Configuracoes e permissoes.';

/**
 * Converte erros tecnicos (Supabase/Postgres/rede) em texto operacional em portugues.
 * Mensagens ja amigaveis da aplicacao sao devolvidas sem alteracao.
 */
export function traduzirErroOperacionalIsoPro(message: string): string {
  const m = message.trim();
  if (!m) return MSG_ERRO_LEITURA_NUVEM;

  const lower = m.toLowerCase();

  if (lower.includes('gravacao bloqueada') || lower.includes('nao e possivel excluir')) {
    return m;
  }

  if (
    lower.includes('duplicate key') ||
    lower.includes('23505') ||
    lower.includes('unique constraint') ||
    lower.includes('already exists')
  ) {
    if (lower.includes('materiais_tenant_id_codigo_lower_uidx') || lower.includes('codigo_lower')) {
      return 'Ja existe um material com este codigo nesta empresa. Cada codigo deve ser unico por empresa.';
    }
    if (lower.includes('materiais_pkey') || (lower.includes('materiais') && lower.includes('pkey'))) {
      return 'Conflito de ID de material na mesma empresa. Recarregue a pagina ou contacte o administrador.';
    }
    return 'Registro duplicado: ja existe um item igual na base de dados desta empresa.';
  }

  if (lower.includes('materiais_pkey')) {
    return 'Conflito de ID de material na mesma empresa. Recarregue a pagina ou contacte o administrador.';
  }

  if (lower.includes('23503') || lower.includes('foreign key') || lower.includes('violates foreign key')) {
    return 'Nao foi possivel concluir: o registro esta referenciado em outros modulos.';
  }

  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('fetch failed') ||
    lower.includes('timeout') ||
    lower.includes('econnrefused')
  ) {
    return MSG_ERRO_LEITURA_NUVEM;
  }

  if (lower.includes('jwt') || lower.includes('invalid api key') || lower.includes('unauthorized')) {
    return 'Acesso negado na nuvem. Verifique URL/chave Supabase em Configuracoes e permissoes da empresa.';
  }

  return m;
}
