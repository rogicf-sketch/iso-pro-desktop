import { z } from 'zod';
import type { Documento } from '../types/documento.types';

/**
 * Contrato em runtime para o JSON de documentos no `localStorage`.
 */
const documentoItemPersistidoSchema = z.object({
  id: z.string(),
  codigoMaterial: z.string(),
  descricaoMaterial: z.string(),
  unidade: z.string(),
  quantidadeProjeto: z.coerce.number(),
  quantidadeAtendida: z.coerce.number(),
  localizacao: z.string().optional().default(''),
});

const documentoPersistidoSchema = z.object({
  id: z.string(),
  numero: z.string(),
  revisao: z.string(),
  descricao: z.string(),
  responsavel: z.string(),
  dataDocumento: z.string(),
  status: z.enum(['pendente', 'parcial', 'recebido', 'atendido', 'cancelado']),
  observacao: z.string(),
  itens: z.array(documentoItemPersistidoSchema),
});

export const documentosPersistidosSchema = z.array(documentoPersistidoSchema);

export function parseDocumentosPersistidos(raw: unknown): Documento[] | null {
  const result = documentosPersistidosSchema.safeParse(raw);
  if (!result.success) {
    return null;
  }
  return result.data as Documento[];
}
