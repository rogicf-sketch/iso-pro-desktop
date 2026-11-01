/**
 * Feature flags / kill-switches de blindagem (canary e operacao).
 *
 * Prioridade: VITE_ISO_PRO_FF_<NAME>=0|1 > localStorage `iso-pro-ff-<name>` > default.
 * Kill switch global: VITE_ISO_PRO_KILL_SWITCH=1 desliga heals automaticos.
 */

export type IsoProFeatureFlag =
  | 'heal_idle_historico'
  | 'heal_idle_escala'
  | 'sot_rir_rnc'
  | 'sot_require_rpc'
  | 'force_update_gate'
  | 'trace_ids';

const DEFAULTS: Record<IsoProFeatureFlag, boolean> = {
  heal_idle_historico: true,
  heal_idle_escala: true,
  sot_rir_rnc: true,
  /** Produção: sem fallback silencioso SoT→snapshot. Desligar só em emergência. */
  sot_require_rpc: true,
  force_update_gate: true,
  trace_ids: true,
};

function readEnvFlag(name: IsoProFeatureFlag): boolean | null {
  const key = `VITE_ISO_PRO_FF_${name.toUpperCase()}`;
  const raw = String((import.meta.env as Record<string, unknown>)[key] ?? '').trim();
  if (raw === '0' || raw === 'false') return false;
  if (raw === '1' || raw === 'true') return true;
  return null;
}

function readLocalFlag(name: IsoProFeatureFlag): boolean | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`iso-pro-ff-${name}`);
    if (raw === '0' || raw === 'false') return false;
    if (raw === '1' || raw === 'true') return true;
  } catch {
    /* ignore */
  }
  return null;
}

export function isKillSwitchActive(): boolean {
  const env = String(import.meta.env.VITE_ISO_PRO_KILL_SWITCH ?? '').trim();
  if (env === '1' || env === 'true') return true;
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('iso-pro-kill-switch');
      if (raw === '1' || raw === 'true') return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

export function isFeatureEnabled(flag: IsoProFeatureFlag): boolean {
  if (isKillSwitchActive()) {
    if (flag === 'heal_idle_historico' || flag === 'heal_idle_escala') return false;
  }
  const env = readEnvFlag(flag);
  if (env != null) return env;
  const local = readLocalFlag(flag);
  if (local != null) return local;
  return DEFAULTS[flag];
}

/** Dev/ops: forçar flag local (nao substitui env). */
export function setLocalFeatureFlag(flag: IsoProFeatureFlag, enabled: boolean | null): void {
  if (typeof localStorage === 'undefined') return;
  const key = `iso-pro-ff-${flag}`;
  if (enabled == null) localStorage.removeItem(key);
  else localStorage.setItem(key, enabled ? '1' : '0');
}
