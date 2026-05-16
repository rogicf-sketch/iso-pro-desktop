import { z } from 'zod';
import type { Etiqueta } from '../types/etiqueta.types';

const etiquetaModeloSchema = z.enum([
  'simples',
  'colorido',
  'industrial',
  'cartao',
  'segregacao',
  'liberacao',
]);

const etiquetaFormatoSchema = z.enum(['a4_2col', 'a4_1col', 'termica_58', 'termica_80']);

const etiquetaPersistidaSchema = z.object({
  id: z.string(),
  titulo: z.string(),
  codigo: z.string(),
  descricao: z.string().default(''),
  modelo: etiquetaModeloSchema,
  formato: etiquetaFormatoSchema,
  larguraMm: z.coerce.number(),
  alturaMm: z.coerce.number(),
  moduloOrigem: z.enum(['materiais', 'recebimentos', 'qualidade', 'livre']),
  referenciaId: z.string(),
  quantidadeCopias: z.coerce.number(),
  status: z.enum(['rascunho', 'pronta', 'impressa', 'cancelada']),
  criadoPor: z.string(),
  dataCriacao: z.string(),
  observacoes: z.string().default(''),
});

export const etiquetasPersistidasSchema = z.array(etiquetaPersistidaSchema);

export function parseEtiquetasPersistidas(raw: unknown): Etiqueta[] | null {
  const result = etiquetasPersistidasSchema.safeParse(raw);
  if (!result.success) {
    return null;
  }
  return result.data as Etiqueta[];
}
