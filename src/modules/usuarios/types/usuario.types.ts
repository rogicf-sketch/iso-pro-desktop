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
};

export type UsuarioFormData = {
  login: string;
  nome: string;
  senha: string;
  ativo: boolean;
  perfilId: string;
  permissoes: UsuarioPermissao[];
};

export type UsuarioFiltro = {
  busca: string;
  status: 'todos' | 'ativos' | 'inativos';
  perfilId: string;
  page: number;
  pageSize: number;
};
