import { z } from 'zod';
import type { Fornecedor } from '../types/fornecedor.types';

const fornecedorPersistidoSchema = z.object({
  id: z.string(),
  nome: z.string(),
  cnpj: z.string(),
  telefone: z.string(),
  email: z.string(),
  endereco: z.string(),
  ativo: z.boolean(),
});

export const fornecedoresPersistidosSchema = z.array(fornecedorPersistidoSchema);

export function parseFornecedoresPersistidos(raw: unknown): Fornecedor[] | null {
  const result = fornecedoresPersistidosSchema.safeParse(raw);
  if (!result.success) {
    return null;
  }
  return result.data as Fornecedor[];
}
