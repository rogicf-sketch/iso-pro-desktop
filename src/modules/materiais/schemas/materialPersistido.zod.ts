import { z } from 'zod';
import type { Material } from '../types/material.types';

/**
 * Contrato em runtime para o JSON de materiais no `localStorage`.
 */
const materialPersistidoSchema = z.object({
  id: z.string(),
  codigo: z.string(),
  /** Legado / testes podem omitir estes campos — alinhar ao `normalizarMaterialLeitura`. */
  codigoBarras: z.string().default(''),
  descricao: z.string(),
  diametro: z.string().default(''),
  disciplina: z.string(),
  unidade: z.string(),
  peso: z.coerce.number(),
  estoqueMinimo: z.coerce.number(),
  saldoAtual: z.coerce.number(),
  ativo: z.boolean(),
  observacao: z.string().default(''),
});

export const materiaisPersistidosSchema = z.array(materialPersistidoSchema);

export function parseMateriaisPersistidos(raw: unknown): Material[] | null {
  const result = materiaisPersistidosSchema.safeParse(raw);
  if (!result.success) {
    return null;
  }
  return result.data as Material[];
}
