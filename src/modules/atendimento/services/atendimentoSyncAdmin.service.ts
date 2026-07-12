import { getActiveTenantId } from '../../../lib/isoProTenant';
import { getSupabase, hasSupabaseConfig } from '../../../lib/supabase';
import type {
  AtendimentoComandoAuditoria,
  AtendimentoComandoOrigem,
  AtendimentoComandoStatus,
  AtendimentoSyncAdminResumo,
  MobileSyncHealthResumo,
  RlsJwtEstadoResumo,
} from '../types/atendimentoSyncAdmin.types';

function isRpcMissingError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = String(error.code ?? '');
  const msg = String(error.message ?? '').toLowerCase();
  return code === 'PGRST202' || msg.includes('could not find the function') || msg.includes('does not exist');
}

function parseOrigem(value: unknown): AtendimentoComandoOrigem {
  const v = String(value ?? '');
  if (v === 'mobile' || v === 'pc' || v === 'reconciliacao' || v === 'outro') return v;
  return 'outro';
}

function parseStatus(value: unknown): AtendimentoComandoStatus {
  return value === 'pendente' ? 'pendente' : 'ok';
}

function mapRow(row: Record<string, unknown>): AtendimentoComandoAuditoria {
  return {
    id: String(row.id ?? ''),
    idempotencyKey: String(row.idempotencyKey ?? row.idempotency_key ?? ''),
    baselineUpdatedAt: String(row.baselineUpdatedAt ?? row.baseline_updated_at ?? ''),
    snapshotUpdatedAt:
      row.snapshotUpdatedAt != null || row.snapshot_updated_at != null
        ? String(row.snapshotUpdatedAt ?? row.snapshot_updated_at)
        : null,
    createdAt: String(row.createdAt ?? row.created_at ?? ''),
    status: parseStatus(row.status),
    historicoCount: Number(row.historicoCount ?? row.historico_count ?? 0),
    documentosCount: Number(row.documentosCount ?? row.documentos_count ?? 0),
    atendimentosCount: Number(row.atendimentosCount ?? row.atendimentos_count ?? 0),
    estornoCount: Number(row.estornoCount ?? row.estorno_count ?? 0),
    origem: parseOrigem(row.origem),
  };
}

export async function listarAtendimentoComandosAdmin(input?: {
  limit?: number;
  offset?: number;
}): Promise<AtendimentoSyncAdminResumo> {
  if (!hasSupabaseConfig()) {
    return {
      total: 0,
      pendentes: 0,
      sucesso24h: 0,
      items: [],
      source: 'indisponivel',
      warning: 'Supabase nao configurado neste browser.',
    };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return {
      total: 0,
      pendentes: 0,
      sucesso24h: 0,
      items: [],
      source: 'indisponivel',
      warning: 'Cliente Supabase indisponivel.',
    };
  }

  const limit = Math.min(Math.max(input?.limit ?? 50, 1), 200);
  const offset = Math.max(input?.offset ?? 0, 0);

  const { data, error } = await supabase.rpc('iso_pro_list_atendimento_comandos', {
    p_tenant_id: getActiveTenantId(),
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    if (isRpcMissingError(error)) {
      return {
        total: 0,
        pendentes: 0,
        sucesso24h: 0,
        items: [],
        source: 'indisponivel',
        warning:
          'RPC iso_pro_list_atendimento_comandos nao encontrada. Aplique a migration 20260706220000_iso_pro_atendimento_comandos_admin.sql no Supabase.',
      };
    }
    return {
      total: 0,
      pendentes: 0,
      sucesso24h: 0,
      items: [],
      source: 'indisponivel',
      warning: error.message,
    };
  }

  const row = (data ?? {}) as Record<string, unknown>;
  const rawItems = row.items;
  const items = Array.isArray(rawItems)
    ? (rawItems as Record<string, unknown>[]).map(mapRow).filter((x) => x.id)
    : [];

  return {
    total: Number(row.total ?? 0),
    pendentes: Number(row.pendentes ?? 0),
    sucesso24h: Number(row.sucesso24h ?? 0),
    items,
    source: 'supabase',
    warning: row._error != null ? String(row._error) : null,
  };
}

export async function auditarRlsJwtEstadoAdmin(): Promise<RlsJwtEstadoResumo> {
  if (!hasSupabaseConfig()) {
    return {
      ok: false,
      authRole: 'none',
      jwtAtivo: false,
      jwtAlinhado: false,
      comandosRls: false,
      comandosTotal: 0,
      authMemberships: 0,
      modo: 'desconhecido',
      warning: 'Supabase nao configurado.',
    };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return {
      ok: false,
      authRole: 'none',
      jwtAtivo: false,
      jwtAlinhado: false,
      comandosRls: false,
      comandosTotal: 0,
      authMemberships: 0,
      modo: 'desconhecido',
      warning: 'Cliente Supabase indisponivel.',
    };
  }

  const { data, error } = await supabase.rpc('iso_pro_auditar_rls_jwt_estado', {
    p_tenant_id: getActiveTenantId(),
  });

  if (error) {
    const missing = isRpcMissingError(error);
    return {
      ok: false,
      authRole: 'none',
      jwtAtivo: false,
      jwtAlinhado: false,
      comandosRls: false,
      comandosTotal: 0,
      authMemberships: 0,
      modo: 'desconhecido',
      warning: missing
        ? 'RPC iso_pro_auditar_rls_jwt_estado em falta. Aplique migration 20260706230000.'
        : error.message,
    };
  }

  const row = (data ?? {}) as Record<string, unknown>;
  const modoRaw = String(row.modo ?? 'desconhecido');
  const modo =
    modoRaw === 'jwt_forte' || modoRaw === 'jwt_desalinhado' || modoRaw === 'anon_compativel'
      ? modoRaw
      : 'desconhecido';

  return {
    ok: row.ok === true,
    authRole: String(row.authRole ?? 'none'),
    jwtAtivo: row.jwtAtivo === true,
    jwtAlinhado: row.jwtAlinhado === true,
    comandosRls: row.comandosRls === true,
    comandosTotal: Number(row.comandosTotal ?? 0),
    authMemberships: Number(row.authMemberships ?? 0),
    modo,
    warning: row.error != null ? String(row.error) : null,
  };
}

export async function listarMobileSyncHealthAlertsAdmin(input?: {
  hours?: number;
}): Promise<MobileSyncHealthResumo> {
  if (!hasSupabaseConfig()) {
    return { alertCount: 0, items: [], source: 'indisponivel', warning: 'Supabase nao configurado.' };
  }
  const supabase = getSupabase();
  if (!supabase) {
    return { alertCount: 0, items: [], source: 'indisponivel', warning: 'Cliente Supabase indisponivel.' };
  }

  const hours = Math.min(Math.max(input?.hours ?? 24, 1), 168);
  const { data, error } = await supabase.rpc('iso_pro_list_mobile_sync_health_alerts', {
    p_tenant_id: getActiveTenantId(),
    p_hours: hours,
  });

  if (error) {
    if (isRpcMissingError(error)) {
      return {
        alertCount: 0,
        items: [],
        source: 'indisponivel',
        warning: 'RPC iso_pro_list_mobile_sync_health_alerts em falta. Aplique migration 20260707200000.',
      };
    }
    return { alertCount: 0, items: [], source: 'indisponivel', warning: error.message };
  }

  const row = (data ?? {}) as Record<string, unknown>;
  const rawItems = row.items;
  const items = Array.isArray(rawItems)
    ? (rawItems as Record<string, unknown>[]).map((r) => ({
        deviceId: String(r.deviceId ?? r.device_id ?? ''),
        deviceLabel: r.deviceLabel != null || r.device_label != null ? String(r.deviceLabel ?? r.device_label) : null,
        appVersion: String(r.appVersion ?? r.app_version ?? ''),
        queueSize: Number(r.queueSize ?? r.queue_size ?? 0),
        reportedAt: String(r.reportedAt ?? r.reported_at ?? ''),
      }))
    : [];

  return {
    alertCount: Number(row.alertCount ?? items.length),
    items: items.filter((x) => x.deviceId),
    source: 'supabase',
    warning: null,
  };
}

export function labelOrigemComando(origem: AtendimentoComandoOrigem): string {
  switch (origem) {
    case 'mobile':
      return 'Mobile';
    case 'pc':
      return 'PC';
    case 'reconciliacao':
      return 'Reconciliacao';
    default:
      return 'Outro';
  }
}

export async function reprocessarAtendimentoComandoAdmin(comandoId: string): Promise<{
  ok: boolean;
  error: string | null;
  snapshotUpdatedAt: string | null;
}> {
  if (!hasSupabaseConfig()) {
    return { ok: false, error: 'Supabase nao configurado.', snapshotUpdatedAt: null };
  }
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Cliente Supabase indisponivel.', snapshotUpdatedAt: null };
  }

  const { data, error } = await supabase.rpc('iso_pro_reprocess_atendimento_comando', {
    p_tenant_id: getActiveTenantId(),
    p_comando_id: comandoId,
  });

  if (error) {
    if (isRpcMissingError(error)) {
      return {
        ok: false,
        error: 'RPC iso_pro_reprocess_atendimento_comando em falta. Aplique migration 20260707120000.',
        snapshotUpdatedAt: null,
      };
    }
    return { ok: false, error: error.message, snapshotUpdatedAt: null };
  }

  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok !== true) {
    return { ok: false, error: String(row.error ?? 'Falha ao reprocessar.'), snapshotUpdatedAt: null };
  }
  const at =
    row.snapshotUpdatedAt != null ? String(row.snapshotUpdatedAt) : null;
  return { ok: true, error: null, snapshotUpdatedAt: at };
}
