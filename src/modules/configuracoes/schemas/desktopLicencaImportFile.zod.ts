import { z } from 'zod';

/** Ficheiro JSON importado na UI (token opcional). */
export const desktopLicencaImportFileSchema = z.object({ token: z.string().optional() }).passthrough();

export function parseDesktopLicencaImportFile(raw: unknown): z.infer<typeof desktopLicencaImportFileSchema> | null {
  const result = desktopLicencaImportFileSchema.safeParse(raw);
  return result.success ? result.data : null;
}
