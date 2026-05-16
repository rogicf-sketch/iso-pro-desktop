import { z } from 'zod';
import type { Inventario } from '../types/inventario.types';

const inventarioItemPersistidoSchema = z.object({
  id: z.string(),
  codigoMaterial: z.string(),
  descricaoMaterial: z.string(),
  unidade: z.string(),
  saldoSistema: z.coerce.number(),
  quantidadeContada: z.coerce.number(),
});

const inventarioPersistidoSchema = z.object({
  id: z.string(),
  codigo: z.string(),
  descricao: z.string(),
  responsavel: z.string(),
  dataInventario: z.string(),
  status: z.enum(['aberto', 'fechado', 'cancelado']),
  contagemMobileHabilitada: z.boolean().optional().default(false),
  observacoes: z.string().default(''),
  itens: z.array(inventarioItemPersistidoSchema),
});

export const inventariosPersistidosSchema = z.array(inventarioPersistidoSchema);

export function parseInventariosPersistidos(raw: unknown): Inventario[] | null {
  const result = inventariosPersistidosSchema.safeParse(raw);
  if (!result.success) {
    return null;
  }
  return result.data as Inventario[];
}
