import { z } from 'zod';
import type { MobileDevice } from '../types/mobileDevice.types';

export const mobileDevicePersistidoSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  nomeAparelho: z.string(),
  usuarioLogin: z.string(),
  usuarioNome: z.string(),
  plataforma: z.enum(['android', 'ios', 'unknown']),
  modelo: z.string(),
  versaoApp: z.string(),
  status: z.enum(['pendente', 'autorizado', 'bloqueado']),
  ultimoAcessoEm: z.string(),
  criadoEm: z.string(),
});

export const mobileDevicesLocalSchema = z.array(mobileDevicePersistidoSchema);

export function parseMobileDevicesLocal(raw: unknown): MobileDevice[] | null {
  const result = mobileDevicesLocalSchema.safeParse(raw);
  return result.success ? result.data : null;
}
