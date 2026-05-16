import { z } from 'zod';

/** Plano de import: array no topo ou `{ documentos: [...] }`. */
const documentosImportRootSchema = z.union([
  z.array(z.unknown()),
  z
    .object({
      documentos: z.array(z.unknown()),
    })
    .passthrough(),
]);

/** Plano de import: array no topo ou `{ recebimentos: [...] }`. */
const recebimentosImportRootSchema = z.union([
  z.array(z.unknown()),
  z
    .object({
      recebimentos: z.array(z.unknown()),
    })
    .passthrough(),
]);

export function parseDocumentosImportJsonRoot(raw: unknown): unknown[] | null {
  const result = documentosImportRootSchema.safeParse(raw);
  if (!result.success) return null;
  const data = result.data;
  return Array.isArray(data) ? data : data.documentos;
}

export function parseRecebimentosImportJsonRoot(raw: unknown): unknown[] | null {
  const result = recebimentosImportRootSchema.safeParse(raw);
  if (!result.success) return null;
  const data = result.data;
  return Array.isArray(data) ? data : data.recebimentos;
}
