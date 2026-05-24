import type { AppModule, AuthUser } from '../modules/auth/types/auth.types';

export const moduleNavigation = [
  { to: '/dashboard', label: 'Painel', modulo: 'dashboard' },
  { to: '/fornecedores', label: 'Fornecedores', modulo: 'fornecedores' },
  { to: '/colaboradores', label: 'Colaboradores', modulo: 'colaboradores' },
  {
    to: '/materiais',
    label: 'Materiais',
    modulo: 'materiais',
    /** Titulo na topbar (sidebar mantem label curto). */
    pageTitle: 'Cadastro de Materiais',
  },
  {
    to: '/documentos',
    label: 'Planejamento',
    modulo: 'documentos',
    pageTitle: 'Planejamento de Materiais',
  },
  { to: '/recebimentos', label: 'Recebimentos', modulo: 'recebimentos' },
  { to: '/conferencia', label: 'Conferência', modulo: 'conferencia' },
  { to: '/etiquetas', label: 'Etiquetas', modulo: 'etiquetas' },
  { to: '/atendimento', label: 'Atendimento', modulo: 'atendimento' },
  { to: '/inventario', label: 'Inventário', modulo: 'inventario' },
  { to: '/equipamentos', label: 'Equipamentos', modulo: 'equipamentos' },
  { to: '/rir', label: 'RIR', modulo: 'rir' },
  { to: '/rnc', label: 'RNC', modulo: 'rnc' },
  { to: '/relatorios', label: 'Relatórios', modulo: 'relatorios' },
  {
    to: '/relatorio-fotografico',
    label: 'Rel. fotográfico',
    modulo: 'relatorios',
    pageTitle: 'Relatório fotográfico',
  },
  {
    to: '/relatorios/final-obra',
    label: 'Relatórios',
    modulo: 'relatorios',
    pageTitle: 'Relatório Final de Obra',
    hideInSidebar: true,
  },
  { to: '/mobile', label: 'Dispositivos mobile', modulo: 'mobile' },
  { to: '/usuarios', label: 'Usuários', modulo: 'usuarios' },
  { to: '/licencas-desktop', label: 'Licenças desktop', modulo: 'configuracoes' },
  { to: '/configuracoes', label: 'Configurações', modulo: 'configuracoes' },
] as const satisfies Array<{
  to: string;
  label: string;
  modulo: AppModule;
  /** Se definido, substitui `label` na topbar (titulo longo do contexto). */
  pageTitle?: string;
  hideInSidebar?: boolean;
}>;

/** Titulo do modulo para a topbar, a partir do pathname (hash router). */
export function getModuleTitleForPath(pathname: string): string {
  if (pathname === '/sem-acesso') return 'Sem acesso';
  const normalized = pathname.replace(/\/$/, '') || '/';
  const sorted = [...moduleNavigation].sort((a, b) => b.to.length - a.to.length);
  const hit = sorted.find(
    (item) => normalized === item.to || normalized.startsWith(`${item.to}/`),
  );
  if (!hit) return 'I.S.O PRO';
  const row = hit as { label: string; pageTitle?: string };
  return row.pageTitle ?? row.label;
}

export function getFirstAccessibleRoute(user: AuthUser | null) {
  if (!user) return '/login';

  const firstAllowed = moduleNavigation.find((item) =>
    user.permissoes.some((permissao) => permissao.modulo === item.modulo && permissao.acao === 'visualizar' && permissao.permitido),
  );

  return firstAllowed?.to ?? '/sem-acesso';
}
