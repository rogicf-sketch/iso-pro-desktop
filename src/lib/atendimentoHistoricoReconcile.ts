import { captureOperationalEvent } from './errorReporting';
import { isFeatureEnabled } from './isoProFeatureFlags';
import { getActiveTenantId } from './isoProTenant';
import { recordOperationalSlo } from './operationalSlo';
import { getSupabase } from './supabase';

export type AtendimentoHistoricoReconcileResult = {
  ok: boolean;
  emptySnapshot?: boolean;
  snapshotCount: number;
  tableCount: number;
  missingInTableCount: number;
  missingInSnapshotCount: number;
  missingInTable: string[];
  missingInSnapshot: string[];
  aligned: boolean;
  healed: boolean;
  healedCount?: number;
  healBatchLimit?: number;
  diverged: boolean;
  error?: string;
};

function isRpcMissingError(message: string): boolean {
  return /function .* does not exist|PGRST202|404|could not find the function/i.test(message);
}

function mapResult(raw: unknown): AtendimentoHistoricoReconcileResult {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const aligned = row.aligned === true;
  return {
    ok: row.ok !== false && !row._error,
    emptySnapshot: row.emptySnapshot === true,
    snapshotCount: Number(row.snapshotCount) || 0,
    tableCount: Number(row.tableCount) || 0,
    missingInTableCount: Number(row.missingInTableCount) || 0,
    missingInSnapshotCount: Number(row.missingInSnapshotCount) || 0,
    missingInTable: Array.isArray(row.missingInTable) ? row.missingInTable.map(String) : [],
    missingInSnapshot: Array.isArray(row.missingInSnapshot)
      ? row.missingInSnapshot.map(String)
      : [],
    aligned,
    healed: row.healed === true,
    healedCount: Number(row.healedCount) || 0,
    healBatchLimit: Number(row.healBatchLimit) || undefined,
    diverged: row.diverged === true || !aligned,
  };
}

/**
 * Compara snapshot.atendimentos com iso_pro_atendimento_lotes.
 * Heal em lotes (p_heal_batch_limit) para nao timeout em obras grandes.
 */
export async function reconcileAtendimentoHistorico(opts?: {
  heal?: boolean;
  healBatchLimit?: number;
}): Promise<AtendimentoHistoricoReconcileResult | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc('iso_pro_reconcile_atendimento_historico', {
    p_tenant_id: getActiveTenantId(),
    p_heal: opts?.heal === true,
    p_heal_batch_limit: opts?.healBatchLimit ?? 40,
  });

  if (error) {
    if (isRpcMissingError(error.message) || /p_heal_batch_limit|Could not find/i.test(error.message)) {
      const legacy = await supabase.rpc('iso_pro_reconcile_atendimento_historico', {
        p_tenant_id: getActiveTenantId(),
        p_heal: opts?.heal === true,
      });
      if (legacy.error) {
        if (isRpcMissingError(legacy.error.message)) return null;
        captureOperationalEvent('reconcile_fail', { error: legacy.error.message, domain: 'atendimento' }, 'error');
        return {
          ok: false,
          snapshotCount: 0,
          tableCount: 0,
          missingInTableCount: 0,
          missingInSnapshotCount: 0,
          missingInTable: [],
          missingInSnapshot: [],
          aligned: false,
          healed: false,
          diverged: true,
          error: legacy.error.message,
        };
      }
      return mapResult(legacy.data);
    }
    console.warn('[atendimento-historico-reconcile]', error.message);
    captureOperationalEvent('reconcile_fail', { error: error.message, domain: 'atendimento' }, 'error');
    return {
      ok: false,
      snapshotCount: 0,
      tableCount: 0,
      missingInTableCount: 0,
      missingInSnapshotCount: 0,
      missingInTable: [],
      missingInSnapshot: [],
      aligned: false,
      healed: false,
      diverged: true,
      error: error.message,
    };
  }

  const row = (data ?? {}) as Record<string, unknown>;
  if (row._error) {
    captureOperationalEvent('reconcile_fail', { error: String(row._error), domain: 'atendimento' }, 'error');
    return {
      ok: false,
      snapshotCount: 0,
      tableCount: 0,
      missingInTableCount: 0,
      missingInSnapshotCount: 0,
      missingInTable: [],
      missingInSnapshot: [],
      aligned: false,
      healed: false,
      diverged: true,
      error: String(row._error),
    };
  }

  const mapped = mapResult(data);
  // Sucesso: só SLO local (Sentry skip). Emite Sentry só se heal efectivamente correu.
  if (mapped.aligned) {
    if (mapped.healed) {
      captureOperationalEvent('reconcile_ok', { domain: 'atendimento', healed: true }, 'info');
    } else {
      recordOperationalSlo('reconcile_ok');
    }
  }
  return mapped;
}

/**
 * Best-effort: divergência pós-heal = sot_divergence (não dual_write_failure).
 */
export async function runAtendimentoHistoricoReconcileBestEffort(opts?: {
  heal?: boolean;
  source?: string;
}): Promise<void> {
  if (opts?.heal && !isFeatureEnabled('heal_idle_historico')) return;
  try {
    const result = await reconcileAtendimentoHistorico({
      heal: opts?.heal === true,
      healBatchLimit: 40,
    });
    if (!result) return;
    // Snapshot vazio / tenant sem histórico: não é divergência operacional.
    if (result.emptySnapshot && result.tableCount === 0) return;
    if (result.diverged || !result.aligned) {
      captureOperationalEvent(
        'sot_divergence',
        {
          source: opts?.source ?? 'atendimento_historico_reconcile',
          domain: 'atendimento',
          snapshotCount: result.snapshotCount,
          tableCount: result.tableCount,
          missingInTableCount: result.missingInTableCount,
          healedCount: result.healedCount,
        },
        'warning',
      );
    }
  } catch (err) {
    console.warn('[atendimento-historico-reconcile]', err);
  }
}
