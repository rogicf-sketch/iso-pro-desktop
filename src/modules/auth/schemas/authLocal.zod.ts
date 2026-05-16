import { z } from 'zod';
import type { AuthUser } from '../types/auth.types';

const permissionRowSchema = z.object({
  modulo: z.string(),
  acao: z.string(),
  permitido: z.boolean(),
});

/** Linhas em `AUTH_USERS_STORAGE_KEY` (mesmo formato que o cadastro de utilizadores). */
export const authUsersStorageRowSchema = z.object({
  id: z.string(),
  login: z.string(),
  nome: z.string(),
  senha: z.string(),
  ativo: z.boolean(),
  perfilId: z.string(),
  perfilNome: z.string(),
  permissoes: z.array(permissionRowSchema).optional(),
});

export const authUsersStorageListSchema = z.array(authUsersStorageRowSchema);

export function parseAuthUsersStorageList(raw: unknown): z.infer<typeof authUsersStorageRowSchema>[] | null {
  const result = authUsersStorageListSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export const authSessionUserSchema = z.object({
  id: z.string(),
  login: z.string(),
  nome: z.string(),
  perfil: z.object({
    id: z.string(),
    nome: z.string(),
  }),
  permissoes: z.array(
    z.object({
      modulo: z.string(),
      acao: z.enum(['visualizar', 'editar', 'administrar']),
      permitido: z.boolean(),
    }),
  ),
});

export function parseAuthSessionUser(raw: unknown): AuthUser | null {
  const result = authSessionUserSchema.safeParse(raw);
  return result.success ? (result.data as AuthUser) : null;
}
