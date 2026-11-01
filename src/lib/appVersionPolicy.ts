/**
 * Politica de versao do EXE: banner informativo vs bloqueio critico.
 *
 * - MIN_SUPPORTED_APP_VERSION: abaixo → banner (AppVersionOutdatedBanner)
 * - FORCE_UPDATE_BELOW_VERSION: abaixo → bloqueio operacional (gate)
 *
 * Assinatura / hash: ver scripts/verify-release.mjs (SHA256SUMS) e dist:win:signed.
 */

/** Abaixo disto: aviso (ainda permite uso com risco). */
export const MIN_SUPPORTED_APP_VERSION = '0.1.247';

/**
 * Abaixo disto: actualizacao obrigatoria (gate) quando feature force_update_gate activa.
 * Subir este valor so apos canary + SHA256SUMS publicados.
 * 0.1.249+ = gateway JWT-only + historico sem ATD-LOAD inventado.
 */
export const FORCE_UPDATE_BELOW_VERSION = '0.1.246';

function parseVersionParts(version: string): number[] {
  const cleaned = String(version ?? '')
    .trim()
    .replace(/^v/i, '')
    .split(/[-+]/)[0] ?? '';
  if (!cleaned) return [0];
  return cleaned.split('.').map((part) => {
    const n = Number.parseInt(part, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

/**
 * True se `version` for estritamente inferior a `minimum` (semver numerico major.minor.patch…).
 */
export function isAppVersionBelowMinimum(
  version: string,
  minimum: string = MIN_SUPPORTED_APP_VERSION,
): boolean {
  const a = parseVersionParts(version);
  const b = parseVersionParts(minimum);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av < bv) return true;
    if (av > bv) return false;
  }
  return false;
}

export type AppUpdatePolicy = {
  belowMinimum: boolean;
  forceUpdate: boolean;
  minSupported: string;
  forceBelow: string;
};

export function getAppUpdatePolicy(version: string): AppUpdatePolicy {
  return {
    belowMinimum: isAppVersionBelowMinimum(version, MIN_SUPPORTED_APP_VERSION),
    forceUpdate: isAppVersionBelowMinimum(version, FORCE_UPDATE_BELOW_VERSION),
    minSupported: MIN_SUPPORTED_APP_VERSION,
    forceBelow: FORCE_UPDATE_BELOW_VERSION,
  };
}
