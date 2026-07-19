/**
 * Feature flags com kill-switch remoto.
 *
 * Objetivo de confiabilidade: poder DESLIGAR uma funcionalidade problemática em
 * todos os PCs/tablets sem redeploy nem tocar em cada máquina. Os operadores
 * escrevem `featureFlags` no payload do snapshot (que todos os clientes já
 * carregam); ao ler o snapshot, cada cliente guarda as flags em cache local e o
 * resolvedor passa a respeitá-las.
 *
 * Regra de segurança: o remoto só pode DESLIGAR (kill-switch). Nunca liga algo
 * que o build/máquina não suporta. Precedência:
 *   1) remoto == false  → OFF (kill-switch vence tudo)
 *   2) env explícito     → ON/OFF
 *   3) opt-out local     → OFF
 *   4) default do código
 */

export const FEATURE_FLAGS_STORAGE = 'iso-pro-desktop-feature-flags-v1';

export type FeatureFlagName = 'estornoV2';

/** Normaliza um valor solto para boolean tri-estado (true/false/undefined). */
export function parseFlagValue(value: unknown): boolean | undefined {
  if (value === true) return true;
  if (value === false) return false;
  const s = String(value ?? '').trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes' || s === 'on') return true;
  if (s === 'false' || s === '0' || s === 'no' || s === 'off') return false;
  return undefined;
}

/** Extrai o mapa `featureFlags` de um payload de snapshot (tolerante a lixo). */
export function extractRemoteFeatureFlags(payload: unknown): Record<string, boolean> {
  const raw = (payload as { featureFlags?: unknown } | null | undefined)?.featureFlags;
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const parsed = parseFlagValue(v);
    if (parsed !== undefined) out[k] = parsed;
  }
  return out;
}

/** Guarda em cache local as flags remotas vindas do snapshot. Se ausentes, mantém as últimas. */
export function applyRemoteFeatureFlags(payload: unknown): void {
  if (typeof localStorage === 'undefined') return;
  const flags = extractRemoteFeatureFlags(payload);
  const temFeatureFlags =
    payload && typeof payload === 'object' && 'featureFlags' in (payload as Record<string, unknown>);
  if (!temFeatureFlags) return; // snapshot parcial sem a fatia — não apagar o que já sabemos
  try {
    localStorage.setItem(FEATURE_FLAGS_STORAGE, JSON.stringify(flags));
  } catch {
    /* ignore quota */
  }
}

export function readRemoteFeatureFlags(): Record<string, boolean> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(FEATURE_FLAGS_STORAGE);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, boolean>;
  } catch {
    return {};
  }
}

/** true quando o remoto desligou explicitamente a flag (kill-switch acionado). */
export function isRemoteKillSwitched(flag: FeatureFlagName): boolean {
  return readRemoteFeatureFlags()[flag] === false;
}

export type ResolveFeatureOptions = {
  /** Valor da variável de ambiente (VITE_…), se existir. */
  envValue?: unknown;
  /** true se o utilizador desligou localmente (opt-out). */
  localOptOut?: boolean;
  /** Valor por omissão quando nada mais decide. */
  defaultEnabled: boolean;
};

/** Resolve se a feature está ligada, aplicando a precedência de segurança. */
export function resolveFeatureEnabled(flag: FeatureFlagName, opts: ResolveFeatureOptions): boolean {
  if (isRemoteKillSwitched(flag)) return false;
  const env = parseFlagValue(opts.envValue);
  if (env !== undefined) return env;
  if (opts.localOptOut) return false;
  return opts.defaultEnabled;
}
