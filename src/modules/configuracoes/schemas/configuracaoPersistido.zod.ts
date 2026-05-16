import { z } from 'zod';

/** Objeto JSON em `localStorage` para configurações (parcial, fundido com defaults no serviço). */
export const configuracaoJsonSchema = z.record(z.string(), z.unknown());

export function parseConfiguracaoJson(raw: unknown): Record<string, unknown> | null {
  const result = configuracaoJsonSchema.safeParse(raw);
  if (!result.success) {
    return null;
  }
  return result.data;
}
