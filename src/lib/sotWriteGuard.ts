/**
 * Hard-fail de escritas SoT: sem dual-write silencioso para snapshot legado.
 * Flag `sot_require_rpc` (default ON). Desligar só em emergência:
 * `localStorage.setItem('iso-pro-ff-sot_require_rpc','0')` ou `VITE_ISO_PRO_FF_SOT_REQUIRE_RPC=0`.
 */
import { isFeatureEnabled } from './isoProFeatureFlags';
import {
  recordSotFallback,
  type SotFallbackDomain,
  type SotFallbackReason,
} from './sotFallbackTelemetry';

export class SotRpcRequiredError extends Error {
  readonly domain: SotFallbackDomain;
  readonly reason: SotFallbackReason;
  readonly traceId?: string;

  constructor(
    domain: SotFallbackDomain,
    reason: SotFallbackReason,
    detail?: string,
    traceId?: string,
  ) {
    super(
      detail?.trim()
        ? `SoT obrigatório (${domain}): ${reason} — ${detail.trim()}. Sem fallback snapshot.`
        : `SoT obrigatório (${domain}): ${reason}. Sem fallback snapshot.`,
    );
    this.name = 'SotRpcRequiredError';
    this.domain = domain;
    this.reason = reason;
    this.traceId = traceId;
  }
}

export function isSotRpcRequired(): boolean {
  return isFeatureEnabled('sot_require_rpc');
}

/**
 * Regista telemetria e, com `sot_require_rpc`, lança em vez de devolver missing.
 * Retorna `{ missing: true }` só quando o hard-fail está desligado (canary/emergência).
 */
export function resolveSotUnavailable(opts: {
  domain: SotFallbackDomain;
  reason: SotFallbackReason;
  detail?: string;
  traceId?: string;
}): { updatedAt: string; missing: true; traceId?: string } {
  recordSotFallback({
    domain: opts.domain,
    reason: opts.reason,
    detail: opts.detail,
    traceId: opts.traceId,
  });
  if (isSotRpcRequired()) {
    throw new SotRpcRequiredError(opts.domain, opts.reason, opts.detail, opts.traceId);
  }
  return {
    updatedAt: new Date().toISOString(),
    missing: true,
    traceId: opts.traceId,
  };
}

/** Cinto de segurança nos services: se still missing e hard-fail on, não patch snapshot. */
export function assertNoSilentSotFallback(
  domain: SotFallbackDomain,
  missing: boolean,
  traceId?: string,
): void {
  if (!missing) return;
  if (!isSotRpcRequired()) return;
  throw new SotRpcRequiredError(domain, 'rpc_missing', 'service tentou fallback legado', traceId);
}
