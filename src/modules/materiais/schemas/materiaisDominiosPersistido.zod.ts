import { z } from 'zod';

/** Objeto em `iso-pro-desktop-materiais-dominios`: disciplinas/unidades como arrays opcionais. */
export const materiaisDominiosPersistidoSchema = z
  .object({
    disciplinas: z.array(z.unknown()).optional(),
    unidades: z.array(z.unknown()).optional(),
  })
  .passthrough();

export function parseMateriaisDominiosPersistido(raw: unknown): z.infer<typeof materiaisDominiosPersistidoSchema> | null {
  const result = materiaisDominiosPersistidoSchema.safeParse(raw);
  return result.success ? result.data : null;
}
