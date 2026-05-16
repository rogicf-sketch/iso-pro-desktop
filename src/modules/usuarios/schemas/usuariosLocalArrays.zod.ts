import { z } from 'zod';

/** Perfis locais: array de objetos com `id` (normalização completa continua no serviço). */
export const usuariosPerfisLocalSchema = z.array(
  z
    .object({
      id: z.string(),
    })
    .passthrough(),
);

/** Utilizadores locais (incl. senha): array com `id` e `login`. */
export const usuariosSistemaLocalSchema = z.array(
  z
    .object({
      id: z.string(),
      login: z.string(),
    })
    .passthrough(),
);

export function parseUsuariosPerfisLocal(raw: unknown): unknown[] | null {
  const result = usuariosPerfisLocalSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function parseUsuariosSistemaLocal(raw: unknown): unknown[] | null {
  const result = usuariosSistemaLocalSchema.safeParse(raw);
  return result.success ? result.data : null;
}
