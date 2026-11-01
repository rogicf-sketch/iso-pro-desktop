import { captureOperationalEvent } from './errorReporting';
import type { EscalaOutboxDomain } from './escalaOutbox';
import { getActiveTenantId } from './isoProTenant';
import { getSupabase } from './supabase';

export type EscalaSotDomainReport = {
  snapshotCount: number;
  tableCount: number;
  missingInTableCount: number;
  missingInSnapshotCount: number;
  missingInTable: string[];
  missingInSnapshot: string[];
  aligned: boolean;
  healed: boolean;
};

export type EscalaSotReconcileResult = {
  ok: boolean;
  emptySnapshot?: boolean;
  domains: Partial<Record<EscalaOutboxDomain, EscalaSotDomainReport>>;
  diverged: EscalaOutboxDomain[];
  healed: boolean;
  error?: string;
};

function isRpcMissingError(message: string): boolean {
  return /function .* does not exist|PGRST202|404|could not find the function/i.test(message);
}

function asDomain(value: unknown): EscalaOutboxDomain | null {
  const d = String(value ?? '');
  if (d === 'documentos' || d === 'recebimentos' || d === 'inventarios' || d === 'rir' || d === 'rnc') {
    return d;
  }
  return null;
}

function mapDomainReport(raw: unknown): EscalaSotDomainReport {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    snapshotCount: Number(row.snapshotCount) || 0,
    tableCount: Number(row.tableCount) || 0,
    missingInTableCount: Number(row.missingInTableCount) || 0,
    missingInSnapshotCount: Number(row.missingInSnapshotCount) || 0,
    missingInTable: Array.isArray(row.missingInTable) ? row.missingInTable.map(String) : [],
    missingInSnapshot: Array.isArray(row.missingInSnapshot) ? row.missingInSnapshot.map(String) : [],
    aligned: row.aligned === true,
    healed: row.healed === true,
  };
}

/**
 * Compara IDs do snapshot com as tabelas de escala.
 * Com heal=true, re-sincroniza dominios com faltas na tabela (snapshot → tabelas).
 */
export async function reconcileEscalaSot(opts?: {
  heal?: boolean;
}): Promise<EscalaSotReconcileResult | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc('iso_pro_reconcile_escala_sot', {
    p_tenant_id: getActiveTenantId(),
    p_heal: opts?.heal === true,
  });

  if (error) {
    if (isRpcMissingError(error.message)) return null;
    console.warn('[escala-sot-reconcile]', error.message);
    return { ok: false, domains: {}, diverged: [], healed: false, error: error.message };
  }

  const row = (data ?? {}) as Record<string, unknown>;
  if (row._error) {
    return { ok: false, domains: {}, diverged: [], healed: false, error: String(row._error) };
  }

  const domainsRaw =
    row.domains && typeof row.domains === 'object' ? (row.domains as Record<string, unknown>) : {};
  const domains: EscalaSotReconcileResult['domains'] = {};
  for (const key of Object.keys(domainsRaw)) {
    const domain = asDomain(key);
    if (domain) domains[domain] = mapDomainReport(domainsRaw[key]);
  }

  const diverged = (Array.isArray(row.diverged) ? row.diverged : [])
    .map(asDomain)
    .filter((d): d is EscalaOutboxDomain => d != null);

  return {
    ok: row.ok === true,
    emptySnapshot: row.emptySnapshot === true,
    domains,
    diverged,
    healed: row.healed === true,
  };
}

/**
 * Best-effort: alerta Sentry + painel local se houver divergencia apos heal opcional.
 */
export async function runEscalaSotReconcileBestEffort(opts?: {
  heal?: boolean;
  source?: string;
}): Promise<EscalaSotReconcileResult | null> {
  try {
    const result = await reconcileEscalaSot({ heal: opts?.heal === true });
    if (!result || result.error) {
      if (result?.error) {
        captureOperationalEvent(
          'sot_divergence',
          { source: opts?.source ?? 'escala_sot_reconcile', error: result.error },
          'warning',
        );
      }
      return result;
    }

    if (result.ok) return result;
    // Sem dados no snapshot: tenant novo / sem operação — não é alerta útil.
    if (result.emptySnapshot && result.diverged.length === 0) return result;

    for (const domain of result.diverged) {
      const report = result.domains[domain];
      const sample = (report?.missingInTable ?? []).slice(0, 3).join(',');
      const message = `SoT divergente (${opts?.source ?? 'reconcile'}): snap=${report?.snapshotCount ?? '?'} tab=${report?.tableCount ?? '?'} faltamNaTabela=${report?.missingInTableCount ?? '?'}${sample ? ` ex=${sample}` : ''}${report?.healed ? ' heal=ok-ainda-divergente' : ''}`;
      captureOperationalEvent(
        'sot_divergence',
        { source: opts?.source ?? 'escala_sot_reconcile', domain, error: message },
        'warning',
      );
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isRpcMissingError(message)) return null;
    console.warn('[escala-sot-reconcile]', message);
    return null;
  }
}
