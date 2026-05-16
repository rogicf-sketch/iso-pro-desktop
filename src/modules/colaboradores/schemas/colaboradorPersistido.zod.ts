import { z } from 'zod';
import type { Colaborador } from '../types/colaborador.types';

/**
 * Linha no JSON do `localStorage` — o serviço aplica `normalizeColaborador` depois.
 */
const colaboradorLinhaPersistidaSchema = z
  .object({
    id: z.string(),
    nome: z.string(),
  })
  .passthrough();

export const colaboradoresPersistidosSchema = z.array(colaboradorLinhaPersistidaSchema);

export function parseColaboradoresPersistidosRaw(
  raw: unknown,
): Array<Partial<Colaborador> & Pick<Colaborador, 'id' | 'nome'>> | null {
  const result = colaboradoresPersistidosSchema.safeParse(raw);
  if (!result.success) {
    return null;
  }
  return result.data as Array<Partial<Colaborador> & Pick<Colaborador, 'id' | 'nome'>>;
}
