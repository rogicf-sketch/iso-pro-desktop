import type { AppModule, PermissionAction } from '../../auth/types/auth.types';

export type UsuarioPermissao = {
  modulo: AppModule;
  acao: PermissionAction;
  permitido: boolean;
};

export type UsuarioPerfil = {
  id: string;
  codigo: string;
  nome: string;
  permissoes: UsuarioPermissao[];
};

export type UsuarioSistema = {
  id: string;
  login: string;
  nome: string;
  ativo: boolean;
  perfilId: string;
  perfilNome: string;
  permissoes: UsuarioPermissao[];
  /** Id do registo em Colaboradores (snapshot); opcional para contas tecnicas / externas. */
  colaboradorId: string | null;
  /** Preenchido na listagem a partir do cadastro de colaboradores (apenas exibicao). */
  colaboradorMatricula?: string;
  colaboradorFuncao?: string;
};

export type UsuarioFormData = {
  login: string;
  nome: string;
  senha: string;
  ativo: boolean;
  perfilId: string;
  permissoes: UsuarioPermissao[];
  /** Opcional: vincula nome/matricula/funcao ao cadastro de colaboradores. */
  colaboradorId: string | null;
  /** UUID em Supabase Auth ligado na nuvem (`usuarios_sistema.auth_user_id`); apenas leitura no formulario. */
  authUserIdSupabase: string | null;
};

export type UsuarioFiltro = {
  busca: string;
  status: 'todos' | 'ativos' | 'inativos';
  perfilId: string;
  page: number;
  pageSize: number;
};
