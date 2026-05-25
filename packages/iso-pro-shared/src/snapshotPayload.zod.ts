import { z } from 'zod';
import type { IsoSnapshotPayload } from './iso.js';
import { stripJsonPollution } from './jsonSafe.js';
import { origemRegistroIsoSchema } from './validators.js';

/** Limites defensivos (DoS / payloads acidentais enormes). */
const MAX_STRING = 500_000;
const MAX_SHORT = 2_048;
const MAX_LIST = 250_000;

const s = z.string().max(MAX_STRING);
const sShort = z.string().max(MAX_SHORT);

function optionalArray<T extends z.ZodTypeAny>(element: T) {
  return z.preprocess((v: unknown) => {
    if (v === undefined || v === null) return undefined;
    if (!Array.isArray(v)) return undefined;
    return v.length > MAX_LIST ? v.slice(0, MAX_LIST) : v;
  }, z.array(element).max(MAX_LIST).optional());
}

const modoRecebimentoSchema = z.enum(['direto', 'aguardando_conferencia']);
const statusConferenciaSchema = z.enum(['pendente', 'conferido']);

const recebimentoItemSchema = z
  .object({
    codigo: s.optional(),
    descricao: s.optional(),
    quantidade: z.union([z.number(), s]).optional(),
    quantidadeConferida: z.union([z.number(), s, z.null()]).optional(),
    observacaoItem: sShort.optional(),
    localizacao: sShort.optional(),
    unidade: sShort.optional(),
    disciplina: sShort.optional(),
  })
  .passthrough();

const materialSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    codigo: sShort.optional(),
    descricao: s.optional(),
    unidade: sShort.optional(),
  })
  .passthrough();

const colaboradorSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    nome: s.optional(),
    matricula: sShort.optional(),
    funcao: sShort.optional(),
    telefone: sShort.optional(),
  })
  .passthrough();

const recebimentoSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    data: sShort.optional(),
    fornecedorId: z.number().optional(),
    fornecedorNome: s.optional(),
    nota: sShort.optional(),
    romaneio: sShort.optional(),
    conferenteId: z.number().optional(),
    conferenteNome: s.optional(),
    observacoes: s.optional(),
    itens: optionalArray(recebimentoItemSchema),
    dataCriacao: sShort.optional(),
    modoRecebimento: modoRecebimentoSchema.optional(),
    statusConferencia: z.union([statusConferenciaSchema, z.null()]).optional(),
    dataConferencia: z.union([sShort, z.null()]).optional(),
  })
  .passthrough();

const documentoItemPlanejamentoSchema = z
  .object({
    codigo: sShort.optional(),
    descricao: s.optional(),
    quantidade: z.number().optional(),
    unidade: sShort.optional(),
    quantidadeAtendida: z.number().optional(),
  })
  .passthrough();

const documentoPlanejamentoSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    numero: sShort.optional(),
    revisao: sShort.optional(),
    data: sShort.optional(),
    descricao: s.optional(),
    responsavel: s.optional(),
    itens: optionalArray(documentoItemPlanejamentoSchema),
  })
  .passthrough();

const atendimentoLoteSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    numero: sShort.optional(),
    data: sShort.optional(),
    tipo: sShort.optional(),
    documento: s.optional(),
    atendente: s.optional(),
    matricula: sShort.optional(),
    recebedor: s.optional(),
  })
  .passthrough();

const atendimentoHistoricoLinhaSchema = z
  .object({
    /** Legado app móvel: número sequencial. Desktop: UUID do item do lote. */
    id: z.union([z.string(), z.number()]).optional(),
    loteId: z.union([z.string(), z.number()]).optional(),
    loteNumero: sShort.optional(),
    data: sShort.optional(),
    documento: s.optional(),
    documentoId: z.union([z.string(), z.number(), z.null()]).optional(),
    documentoItemId: z.union([z.string(), z.number(), z.null()]).optional(),
    codigo: sShort.optional(),
    descricao: s.optional(),
    quantidade: z.number().optional(),
    unidade: sShort.optional(),
    atendente: s.optional(),
    matricula: sShort.optional(),
    atendenteFuncao: sShort.optional(),
    recebedor: s.optional(),
    recebedorMatricula: sShort.optional(),
    recebedorFuncao: sShort.optional(),
    origem: origemRegistroIsoSchema.optional(),
  })
  .passthrough();

const inventarioItemSnapshotSchema = z
  .object({
    id: sShort.optional(),
    codigoMaterial: sShort.optional(),
    descricaoMaterial: s.optional(),
    unidade: sShort.optional(),
    saldoSistema: z.number().optional(),
    quantidadeContada: z.number().optional(),
  })
  .passthrough();

const inventarioSnapshotSchema = z
  .object({
    id: sShort.optional(),
    codigo: sShort.optional(),
    descricao: s.optional(),
    responsavel: s.optional(),
    dataInventario: sShort.optional(),
    status: z.enum(['aberto', 'fechado', 'cancelado']).optional(),
    contagemMobileHabilitada: z.boolean().optional(),
    observacoes: s.optional(),
    itens: optionalArray(inventarioItemSnapshotSchema),
  })
  .passthrough();

const unknownArray = optionalArray(z.unknown());

/** Esquema permissivo (compatível com dados legados) mas com tipos e limites nas coleções principais. */
export const isoSnapshotPayloadSchema = z
  .object({
    materiais: optionalArray(materialSchema),
    fornecedores: unknownArray,
    colaboradores: optionalArray(colaboradorSchema),
    recebimentos: optionalArray(recebimentoSchema),
    rirRegistros: unknownArray,
    rncRegistros: unknownArray,
    documentos: optionalArray(documentoPlanejamentoSchema),
    atendimentoHistorico: optionalArray(atendimentoHistoricoLinhaSchema),
    atendimentoLotes: optionalArray(atendimentoLoteSchema),
    inventarios: optionalArray(inventarioSnapshotSchema),
    etiquetas: unknownArray,
    estoqueAjustes: unknownArray,
    configuracoesSistema: z.record(z.string(), z.unknown()).optional(),
    usuariosSistema: z.unknown().optional(),
    disciplinas: optionalArray(sShort),
    unidades: optionalArray(sShort),
    versao: sShort.optional(),
    dataAtualizacao: sShort.optional(),
  })
  .passthrough();

export type ParseIsoSnapshotPayloadResult =
  | { ok: true; data: IsoSnapshotPayload }
  | { ok: false; error: string };

/**
 * Valida e normaliza o payload do `iso_pro_snapshot`.
 * 1) Remove poluição de protótipo comum
 * 2) Aplica Zod (campos desconhecidos no topo mantêm-se com `.passthrough()`)
 */
export function parseIsoSnapshotPayloadFromUnknown(raw: unknown): ParseIsoSnapshotPayloadResult {
  if (raw === null || raw === undefined) {
    return { ok: true, data: {} };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Snapshot: payload tem de ser um objeto JSON.' };
  }
  const cleaned = stripJsonPollution<Record<string, unknown>>(raw);
  const parsed = isoSnapshotPayloadSchema.safeParse(cleaned);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.') || 'raiz'}: ${i.message}`).slice(0, 8).join('; ');
    return { ok: false, error: `Snapshot inválido: ${msg}` };
  }
  return { ok: true, data: parsed.data as IsoSnapshotPayload };
}
