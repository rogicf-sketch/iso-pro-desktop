import type { AppModule, AuthUser } from '../modules/auth/types/auth.types';

export const moduleNavigation = [
  { to: '/dashboard', label: 'Painel', modulo: 'dashboard' },
  { to: '/fornecedores', label: 'Fornecedores', modulo: 'fornecedores' },
  { to: '/colaboradores', label: 'Colaboradores', modulo: 'colaboradores' },
  { to: '/materiais', label: 'Materiais', modulo: 'materiais' },
  { to: '/documentos', label: 'Documentos', modulo: 'documentos' },
  { to: '/recebimentos', label: 'Recebimentos', modulo: 'recebimentos' },
  { to: '/conferencia', label: 'Conferência', modulo: 'conferencia' },
  { to: '/etiquetas', label: 'Etiquetas', modulo: 'etiquetas' },
  { to: '/atendimento', label: 'Atendimento', modulo: 'atendimento' },
  { to: '/inventario', label: 'Inventário', modulo: 'inventario' },
  { to: '/rir', label: 'RIR', modulo: 'rir' },
  { to: '/rnc', label: 'RNC', modulo: 'rnc' },
  { to: '/relatorios', label: 'Relatórios', modulo: 'relatorios' },
  { to: '/relatorio-fotografico', label: 'Rel. fotográfico', modulo: 'relatorios' },
  { to: '/mobile', label: 'Dispositivos mobile', modulo: 'mobile' },
  { to: '/usuarios', label: 'Usuários', modulo: 'usuarios' },
  { to: '/licencas-desktop', label: 'Licenças desktop', modulo: 'configuracoes' },
  { to: '/configuracoes', label: 'Configurações', modulo: 'configuracoes' },
] as const satisfies Array<{ to: string; label: string; modulo: AppModule }>;

export function getFirstAccessibleRoute(user: AuthUser | null) {
  if (!user) return '/login';

  const firstAllowed = moduleNavigation.find((item) =>
    user.permissoes.some((permissao) => permissao.modulo === item.modulo && permissao.acao === 'visualizar' && permissao.permitido),
  );

  return firstAllowed?.to ?? '/sem-acesso';
}
