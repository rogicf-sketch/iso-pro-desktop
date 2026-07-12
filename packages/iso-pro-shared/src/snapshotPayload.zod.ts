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

/** Postgres/JSON frequentemente devolve `null` em vez de omitir o campo. */
const sOpt = z.preprocess((v) => (v === null ? undefined : v), s.optional());
const sShortOpt = z.preprocess((v) => (v === null ? undefined : v), sShort.optional());

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
    codigo: sOpt,
    descricao: sOpt,
    quantidade: z.union([z.number(), s]).optional(),
    quantidadeConferida: z.union([z.number(), s, z.null()]).optional(),
    observacaoItem: sShortOpt,
    localizacao: sShortOpt,
    unidade: sShortOpt,
    disciplina: sShortOpt,
  })
  .passthrough();

const materialSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    codigo: sShortOpt,
    descricao: sOpt,
    unidade: sShortOpt,
  })
  .passthrough();

const colaboradorSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    nome: sOpt,
    matricula: sShortOpt,
    funcao: sShortOpt,
    telefone: sShortOpt,
  })
  .passthrough();

const recebimentoSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    data: sShortOpt,
    fornecedorId: z.number().optional(),
    fornecedorNome: sOpt,
    nota: sShortOpt,
    romaneio: sShortOpt,
    conferenteId: z.number().optional(),
    conferenteNome: sOpt,
    observacoes: sOpt,
    itens: optionalArray(recebimentoItemSchema),
    dataCriacao: sShortOpt,
    modoRecebimento: modoRecebimentoSchema.optional(),
    statusConferencia: z.union([statusConferenciaSchema, z.null()]).optional(),
    dataConferencia: z.union([sShort, z.null()]).optional(),
  })
  .passthrough();

const documentoItemPlanejamentoSchema = z
  .object({
    codigo: sShortOpt,
    descricao: sOpt,
    quantidade: z.number().optional(),
    unidade: sShortOpt,
    quantidadeAtendida: z.number().optional(),
  })
  .passthrough();

const documentoPlanejamentoSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    numero: sShortOpt,
    revisao: sShortOpt,
    data: sShortOpt,
    descricao: sOpt,
    responsavel: sOpt,
    itens: optionalArray(documentoItemPlanejamentoSchema),
  })
  .passthrough();

const atendimentoLoteSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    numero: sShortOpt,
    data: sShortOpt,
    tipo: sShortOpt,
    documento: sOpt,
    atendente: sOpt,
    matricula: sShortOpt,
    recebedor: sOpt,
  })
  .passthrough();

const atendimentoHistoricoLinhaSchema = z
  .object({
    /** Legado app móvel: número sequencial. Desktop: UUID do item do lote. */
    id: z.union([z.string(), z.number()]).optional(),
    loteId: z.union([z.string(), z.number()]).optional(),
    loteNumero: sShortOpt,
    data: sShortOpt,
    documento: sOpt,
    documentoId: z.union([z.string(), z.number(), z.null()]).optional(),
    documentoItemId: z.union([z.string(), z.number(), z.null()]).optional(),
    codigo: sShortOpt,
    descricao: sOpt,
    quantidade: z.number().optional(),
    unidade: sShortOpt,
    atendente: sOpt,
    matricula: sShortOpt,
    atendenteFuncao: sShortOpt,
    recebedor: sOpt,
    recebedorMatricula: sShortOpt,
    recebedorFuncao: sShortOpt,
    origem: origemRegistroIsoSchema.optional(),
  })
  .passthrough();

const inventarioItemSnapshotSchema = z
  .object({
    id: sShortOpt,
    codigoMaterial: sShortOpt,
    descricaoMaterial: sOpt,
    unidade: sShortOpt,
    saldoSistema: z.number().optional(),
    quantidadeContada: z.number().optional(),
    localizacaoContada: sShortOpt,
  })
  .passthrough();

const inventarioSnapshotSchema = z
  .object({
    id: sShortOpt,
    codigo: sShortOpt,
    descricao: sOpt,
    responsavel: sOpt,
    dataInventario: sShortOpt,
    status: z.enum(['aberto', 'fechado', 'cancelado']).optional(),
    contagemMobileHabilitada: z.boolean().optional(),
    observacoes: sOpt,
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
    versao: sShortOpt,
    dataAtualizacao: sShortOpt,
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
