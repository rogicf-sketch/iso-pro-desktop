import { z } from 'zod';
import type { Documento } from '../types/documento.types';

/**
 * Contrato em runtime para o JSON de documentos no `localStorage`.
 * Tolerante: ids numéricos, campos em falta e 1 linha má não invalidam a lista inteira
 * (antes um único documento inválido fazia o banner “Reparar com a nuvem” voltar sempre).
 */

const STATUS_VALIDOS = new Set(['pendente', 'parcial', 'recebido', 'atendido', 'cancelado']);

const strCoerce = z.preprocess((v) => (v == null ? '' : String(v)), z.string());

const documentoItemPersistidoSchema = z.object({
  id: strCoerce,
  codigoMaterial: strCoerce,
  descricaoMaterial: strCoerce,
  unidade: strCoerce.default('UN'),
  quantidadeProjeto: z.coerce.number().catch(0),
  quantidadeAtendida: z.coerce.number().catch(0),
  localizacao: strCoerce.optional().default(''),
});

const documentoPersistidoSchema = z.object({
  id: strCoerce,
  numero: strCoerce,
  revisao: strCoerce.default('A'),
  descricao: strCoerce,
  responsavel: strCoerce,
  dataDocumento: strCoerce,
  status: z.preprocess((v) => {
    const s = String(v ?? 'pendente').trim().toLowerCase();
    return STATUS_VALIDOS.has(s) ? s : 'pendente';
  }, z.enum(['pendente', 'parcial', 'recebido', 'atendido', 'cancelado'])),
  observacao: strCoerce.default(''),
  itens: z.array(documentoItemPersistidoSchema).catch([]),
});

export const documentosPersistidosSchema = z.array(documentoPersistidoSchema);

/**
 * Devolve a lista válida. Se o payload não for array → null (corrupção real).
 * Se for array com alguns inválidos → mantém só os válidos (não null).
 * Só null quando array vazio de válidos E havia entradas (todas irrecuperáveis).
 */
export function parseDocumentosPersistidos(raw: unknown): Documento[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0) return [];

  const whole = documentosPersistidosSchema.safeParse(raw);
  if (whole.success) return whole.data as Documento[];

  // Salvamento documento a documento — evita “1 linha má = lista inteira corrompida”.
  const out: Documento[] = [];
  for (const entry of raw) {
    const one = documentoPersistidoSchema.safeParse(entry);
    if (!one.success) continue;
    const doc = one.data as Documento;
    // Exige identidade mínima (evita `{}` virar documento fantasma).
    if (!String(doc.id).trim() || !String(doc.numero).trim()) continue;
    out.push(doc);
  }
  if (out.length === 0) return null;
  return out;
}
