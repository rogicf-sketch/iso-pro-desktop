import { getActiveTenantId } from './isoProTenant';
import { withExponentialBackoff } from './retryWithBackoff';
import { getSupabase, hasSupabaseConfig } from './supabase';
import { captureOperationalEvent } from './errorReporting';

export type ResourceLockKind = 'atendimento' | 'recebimento' | 'rir' | 'rnc';

export type ResourceLockClaim = {
  ok: boolean;
  reason?: string;
  holderLogin?: string;
  holderLabel?: string;
  expiresAt?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseClaim(data: unknown): ResourceLockClaim {
  const row = asRecord(data);
  if (!row) return { ok: false, reason: 'empty' };
  return {
    ok: row.ok === true,
    reason: typeof row.reason === 'string' ? row.reason : undefined,
    holderLogin: typeof row.holder_login === 'string' ? row.holder_login : undefined,
    holderLabel: typeof row.holder_label === 'string' ? row.holder_label : undefined,
    expiresAt: typeof row.expires_at === 'string' ? row.expires_at : undefined,
  };
}

/** Outro posto detém o recurso — edição deve ficar bloqueada. */
export function isResourceLockHeldByOther(claim: ResourceLockClaim): boolean {
  return claim.ok === false && claim.reason === 'held';
}

const KIND_LABEL: Record<ResourceLockKind, string> = {
  atendimento: 'Desenho',
  recebimento: 'Recebimento',
  rir: 'RIR',
  rnc: 'RNC',
};

export function mensagemResourceLockBloqueado(
  kind: ResourceLockKind,
  claim: ResourceLockClaim,
): string {
  const quem = (claim.holderLabel || claim.holderLogin || 'outro posto').trim();
  const rotulo = KIND_LABEL[kind];
  return `${rotulo} em uso por ${quem}. Edicao bloqueada neste posto ate o titular libertar ou o lock expirar (~2 min).`;
}

/**
 * Claim com retries exponenciais so para erros transitórios (rede/timeout/deadlock).
 * `held` por outro posto NAO e reintentado (evita race/spin).
 *
 * Seguranca RLS: policies usam iso_pro_rls_tenant_authenticated_only (sem USING true) —
 * ver migration 20260803230000. Locks sao presence leves (TTL); nao substituem OCC.
 */
export async function claimResourceLock(input: {
  kind: ResourceLockKind;
  resourceId: string;
  holderLogin: string;
  holderLabel?: string;
  ttlSeconds?: number;
}): Promise<ResourceLockClaim> {
  if (!hasSupabaseConfig()) return { ok: true };
  const resourceId = input.resourceId.trim();
  const holderLogin = input.holderLogin.trim();
  if (!resourceId || !holderLogin) return { ok: false, reason: 'invalid_args' };

  const sb = getSupabase();
  if (!sb) return { ok: true };

  const started = Date.now();
  try {
    return await withExponentialBackoff(
      async () => {
        const { data, error } = await sb.rpc('iso_pro_claim_resource_lock', {
          p_tenant_id: getActiveTenantId(),
          p_resource_kind: input.kind,
          p_resource_id: resourceId,
          p_holder_login: holderLogin,
          p_holder_label: (input.holderLabel ?? holderLogin).trim(),
          p_ttl_seconds: input.ttlSeconds ?? 120,
        });
        if (error) {
          if (/function .* does not exist|PGRST202|404/i.test(error.message)) {
            return { ok: true };
          }
          throw new Error(error.message);
        }
        const claim = parseClaim(data);
        if (claim.reason === 'held') return claim;
        if (!claim.ok && claim.reason && /deadlock|timeout|temporar/i.test(claim.reason)) {
          throw new Error(claim.reason);
        }
        return claim;
      },
      {
        maxAttempts: 4,
        baseMs: 60,
        maxMs: 1200,
        timeoutMs: 6_000,
        shouldRetry: (err) => {
          const msg = err instanceof Error ? err.message : String(err);
          if (/held|invalid_args|forbidden/i.test(msg)) return false;
          return /timeout|network|fetch|deadlock|40001|40P01|503|502|429/i.test(msg);
        },
      },
    );
  } catch (error) {
    const elapsed = Date.now() - started;
    if (elapsed > 2_500) {
      captureOperationalEvent(
        'lock_long',
        { kind: input.kind, resourceId, elapsedMs: elapsed, error: String(error) },
        'warning',
      );
    }
    return { ok: false, reason: error instanceof Error ? error.message : 'claim_failed' };
  }
}

export async function releaseResourceLock(input: {
  kind: ResourceLockKind;
  resourceId: string;
  holderLogin: string;
}): Promise<void> {
  if (!hasSupabaseConfig()) return;
  const resourceId = input.resourceId.trim();
  const holderLogin = input.holderLogin.trim();
  if (!resourceId || !holderLogin) return;
  try {
    const sb = getSupabase();
    if (!sb) return;
    await sb.rpc('iso_pro_release_resource_lock', {
      p_tenant_id: getActiveTenantId(),
      p_resource_kind: input.kind,
      p_resource_id: resourceId,
      p_holder_login: holderLogin,
    });
  } catch {
    /* ignore */
  }
}

export async function forceReleaseResourceLock(input: {
  kind: ResourceLockKind;
  resourceId: string;
  actorLogin: string;
}): Promise<ResourceLockClaim> {
  if (!hasSupabaseConfig()) return { ok: true };
  const resourceId = input.resourceId.trim();
  const actorLogin = input.actorLogin.trim();
  if (!resourceId || !actorLogin) return { ok: false, reason: 'invalid_args' };

  const sb = getSupabase();
  if (!sb) return { ok: true };
  const { data, error } = await sb.rpc('iso_pro_force_release_resource_lock', {
    p_tenant_id: getActiveTenantId(),
    p_resource_kind: input.kind,
    p_resource_id: resourceId,
    p_actor_login: actorLogin,
  });
  if (error) {
    if (/function .* does not exist|PGRST202|404/i.test(error.message)) {
      return { ok: false, reason: 'rpc_missing' };
    }
    return { ok: false, reason: error.message };
  }
  return parseClaim(data);
}
