import { z } from 'zod';

/**
 * JSON local onde se espera um array de objetos (ex.: documentos/materiais/atendimentos, ajustes de estoque).
 */
export const localStorageRecordArraySchema = z.array(z.record(z.string(), z.unknown()));

export function parseLocalStorageRecordArray(raw: unknown): Record<string, unknown>[] | null {
  const result = localStorageRecordArraySchema.safeParse(raw);
  return result.success ? result.data : null;
}
