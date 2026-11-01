/**
 * Canal de release (canary vs stable).
 * Build: VITE_RELEASE_CHANNEL=canary|stable (omissão: stable).
 */

export type ReleaseChannel = 'stable' | 'canary';

export function getReleaseChannel(): ReleaseChannel {
  const raw = String(import.meta.env.VITE_RELEASE_CHANNEL ?? 'stable').trim().toLowerCase();
  return raw === 'canary' ? 'canary' : 'stable';
}

/** MFA no login: obrigatório para administradores (inclui admin de cada empresa nova). Operadores de obra: login + senha. */
export const MFA_POLICY_NOTE =
  'MFA obrigatório para administradores e TI (incluindo o admin de cada empresa na nuvem). Operadores de obra: login + senha + dispositivo autorizado.';
