import { z } from 'zod';
import type { Recebimento } from '../types/recebimento.types';

/**
 * Contrato em runtime para o JSON de recebimentos no `localStorage`.
 * Falhas de parse → o serviço restaura seed (mesmo comportamento que JSON inválido).
 */
const recebimentoItemPersistidoSchema = z.object({
  id: z.string(),
  codigoMaterial: z.string(),
  descricaoMaterial: z.string(),
  unidade: z.string(),
  disciplina: z.string(),
  localizacao: z.string(),
  quantidadeRecebida: z.coerce.number(),
  quantidadeConferida: z.coerce.number(),
  pesoUnitario: z.coerce.number(),
  pesoTotal: z.coerce.number(),
  certificado: z.string().optional(),
  observacaoItem: z.string().optional(),
});

const recebimentoPersistidoSchema = z.object({
  id: z.string(),
  fornecedor: z.string(),
  dataRecebimento: z.string(),
  notaFiscal: z.string(),
  romaneio: z.string(),
  conferente: z.string(),
  modoRecebimento: z.enum(['direto', 'aguardando_conferencia']),
  status: z.enum([
    'rascunho',
    'aguardando_conferencia',
    'conferido',
    'parcialmente_conferido',
    'divergente',
    'cancelado',
  ]),
  observacoes: z.string(),
  itens: z.array(recebimentoItemPersistidoSchema),
  dataConferencia: z.string().optional(),
});

export const recebimentosPersistidosSchema = z.array(recebimentoPersistidoSchema);

export function parseRecebimentosPersistidos(raw: unknown): Recebimento[] | null {
  const result = recebimentosPersistidosSchema.safeParse(raw);
  if (!result.success) {
    return null;
  }
  return result.data as Recebimento[];
}
