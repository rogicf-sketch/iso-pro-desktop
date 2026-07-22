/**
 * Auditoria operacional na nuvem (complemento ao log local do PC).
 * Best-effort: falha de rede/RPC nunca bloqueia a operação de negócio.
 */
import { isElectronApp } from './isElectronApp';
import { getActiveTenantId } from './isoProTenant';
import { getSupabase, hasSupabaseConfig } from './supabase';

export type OperationalAuditInput = {
  action: string;
  actorLogin: string;
  detail?: string;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  targetLogin?: string;
};

export type OperationalAuditRow = {
  id: string;
  created_at: string;
  actor_login: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  detail: string;
  before_json: unknown;
  after_json: unknown;
  device_label: string | null;
  user_agent: string | null;
  client_ip: string | null;
  client_kind: string | null;
};

const IP_CACHE_TTL_MS = 30 * 60_000;
let cachedIp: { value: string | null; at: number } | null = null;
let ipInflight: Promise<string | null> | null = null;

function clientKind(): 'windows' | 'web' {
  return isElectronApp() ? 'windows' : 'web';
}

function deviceLabel(): string {
  if (typeof navigator === 'undefined') return clientKind();
  const platform = navigator.platform || '';
  const kind = clientKind();
  return platform ? `${kind}/${platform}` : kind;
}

function userAgent(): string | null {
  if (typeof navigator === 'undefined') return null;
  return navigator.userAgent?.slice(0, 500) || null;
}

async function resolvePublicIpBestEffort(): Promise<string | null> {
  const now = Date.now();
  if (cachedIp && now - cachedIp.at < IP_CACHE_TTL_MS) return cachedIp.value;
  if (ipInflight) return ipInflight;

  ipInflight = (async () => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch('https://api.ipify.org?format=json', { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`ipify ${res.status}`);
      const json = (await res.json()) as { ip?: string };
      const ip = String(json.ip ?? '').trim() || null;
      cachedIp = { value: ip, at: Date.now() };
      return ip;
    } catch {
      cachedIp = { value: null, at: Date.now() };
      return null;
    } finally {
      ipInflight = null;
    }
  })();

  return ipInflight;
}

/** Grava evento na nuvem sem lançar (fire-and-forget seguro). */
export function recordOperationalAuditBestEffort(input: OperationalAuditInput): void {
  try {
    if (!hasSupabaseConfig()) return;
  } catch {
    return;
  }
  const actor = input.actorLogin?.trim() || 'desconhecido';
  const action = input.action?.trim();
  if (!action) return;

  void (async () => {
    try {
      const supabase = getSupabase();
      if (!supabase) return;
      const clientIp = await resolvePublicIpBestEffort();
      const detailParts = [input.detail?.trim() || ''];
      if (input.targetLogin?.trim()) detailParts.push(`alvo=${input.targetLogin.trim()}`);
      const { error } = await supabase.rpc('iso_pro_append_audit_log', {
        p_tenant_id: getActiveTenantId(),
        p_actor_login: actor,
        p_action: action,
        p_detail: detailParts.filter(Boolean).join(' | ').slice(0, 4000),
        p_entity_type: input.entityType?.trim() || null,
        p_entity_id: input.entityId?.trim() || null,
        p_before: input.before ?? null,
        p_after: input.after ?? null,
        p_device_label: deviceLabel(),
        p_user_agent: userAgent(),
        p_client_ip: clientIp,
        p_client_kind: clientKind(),
      });
      if (error) {
        console.warn('[I.S.O PRO] audit nuvem:', error.message);
      }
    } catch (err) {
      console.warn('[I.S.O PRO] audit nuvem falhou', err);
    }
  })();
}

export async function listOperationalAudit(options?: {
  limit?: number;
  offset?: number;
  action?: string;
  actorLogin?: string;
}): Promise<{ items: OperationalAuditRow[]; total: number; error?: string }> {
  if (!hasSupabaseConfig()) {
    return { items: [], total: 0, error: 'Supabase nao configurado.' };
  }
  const supabase = getSupabase();
  if (!supabase) return { items: [], total: 0, error: 'Supabase indisponivel.' };

  const { data, error } = await supabase.rpc('iso_pro_list_audit_log', {
    p_tenant_id: getActiveTenantId(),
    p_limit: options?.limit ?? 100,
    p_offset: options?.offset ?? 0,
    p_action: options?.action?.trim() || null,
    p_actor_login: options?.actorLogin?.trim() || null,
  });

  if (error) return { items: [], total: 0, error: error.message };
  const row = (data ?? {}) as {
    items?: OperationalAuditRow[];
    total?: number;
    _error?: string;
  };
  if (row._error) return { items: [], total: 0, error: row._error };
  return {
    items: Array.isArray(row.items) ? row.items : [],
    total: Number(row.total) || 0,
  };
}
