import { z } from 'zod';

export const materiaisImportStagingStoredSchema = z.object({
  fileName: z.string(),
  text: z.string(),
  linhaCount: z.number(),
  savedAt: z.number(),
});

export function parseMateriaisImportStagingStored(raw: unknown): z.infer<typeof materiaisImportStagingStoredSchema> | null {
  const result = materiaisImportStagingStoredSchema.safeParse(raw);
  return result.success ? result.data : null;
}
