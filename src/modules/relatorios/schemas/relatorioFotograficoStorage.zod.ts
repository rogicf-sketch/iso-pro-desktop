import { z } from 'zod';

export const relatorioFotograficoSeqStateSchema = z
  .object({
    year: z.string().optional(),
    n: z.number().optional(),
  })
  .passthrough();

export function parseRelatorioFotograficoSeqState(raw: unknown): { year?: string; n?: number } {
  const result = relatorioFotograficoSeqStateSchema.safeParse(raw);
  return result.success ? result.data : {};
}

/** Aceita strings e números (legado) e normaliza para string. */
const relatorioFotograficoCatalogIdSchema = z.union([z.string(), z.number()]).transform((v) => String(v));

export const relatorioFotograficoCatalogSchema = z
  .object({
    version: z.number().optional(),
    ids: z.array(relatorioFotograficoCatalogIdSchema).optional(),
  })
  .passthrough();

export function parseRelatorioFotograficoCatalogIds(raw: unknown): string[] {
  const result = relatorioFotograficoCatalogSchema.safeParse(raw);
  if (!result.success) return [];
  return Array.isArray(result.data.ids) ? result.data.ids : [];
}
