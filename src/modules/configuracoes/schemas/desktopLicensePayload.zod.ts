import { z } from 'zod';

/** Payload JWT (parte antes da assinatura) da licença desktop. */
export const desktopLicensePayloadSchema = z
  .object({
    licenseId: z.string(),
    issuedTo: z.string(),
    machineFingerprint: z.string(),
    machineLabel: z.string().optional(),
    issuedAt: z.string(),
    expiresAt: z.string().optional(),
    appVersion: z.string().optional(),
    status: z.enum(['active', 'revoked']).optional(),
  })
  .passthrough();

export function parseDesktopLicensePayloadJson(raw: unknown): z.infer<typeof desktopLicensePayloadSchema> | null {
  const result = desktopLicensePayloadSchema.safeParse(raw);
  return result.success ? result.data : null;
}
