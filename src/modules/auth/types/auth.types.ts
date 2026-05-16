export type AppModule =
  | 'dashboard'
  | 'fornecedores'
  | 'colaboradores'
  | 'materiais'
  | 'documentos'
  | 'recebimentos'
  | 'conferencia'
  | 'etiquetas'
  | 'equipamentos'
  | 'configuracoes'
  | 'atendimento'
  | 'inventario'
  | 'rir'
  | 'rnc'
  | 'relatorios'
  | 'mobile'
  | 'usuarios';

export type PermissionAction = 'visualizar' | 'editar' | 'administrar';

export type Permission = {
  modulo: AppModule;
  acao: PermissionAction;
  permitido: boolean;
};

export type AuthProfile = {
  id: string;
  nome: string;
};

export type AuthUser = {
  id: string;
  login: string;
  nome: string;
  perfil: AuthProfile;
  permissoes: Permission[];
};

export type LoginPayload = {
  login: string;
  senha: string;
};
