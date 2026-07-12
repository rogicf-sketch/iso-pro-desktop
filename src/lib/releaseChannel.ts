/**
 * Canal de release (canary vs stable).
 * Build: VITE_RELEASE_CHANNEL=canary|stable (omissão: stable).
 */

export type ReleaseChannel = 'stable' | 'canary';

export function getReleaseChannel(): ReleaseChannel {
  const raw = String(import.meta.env.VITE_RELEASE_CHANNEL ?? 'stable').trim().toLowerCase();
  return raw === 'canary' ? 'canary' : 'stable';
}

/** MFA no login: só contas Auth com factor — política I.S.O PRO = admins/TI, não operadores de campo. */
export const MFA_POLICY_NOTE =
  'MFA recomendado apenas para administradores e TI. Operadores de obra: login + senha + dispositivo autorizado.';
