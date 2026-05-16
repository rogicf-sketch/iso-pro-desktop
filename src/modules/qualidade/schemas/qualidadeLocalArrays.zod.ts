import { z } from 'zod';

/**
 * JSON local de RIR/RNC: array de objetos com `id` (normalização completa continua nos serviços).
 */
export const qualidadeRegistrosLocalSchema = z.array(
  z
    .object({
      id: z.union([z.string(), z.number()]),
    })
    .passthrough(),
);

export function parseQualidadeRegistrosLocal(raw: unknown): unknown[] | null {
  const result = qualidadeRegistrosLocalSchema.safeParse(raw);
  if (!result.success) {
    return null;
  }
  return result.data;
}
