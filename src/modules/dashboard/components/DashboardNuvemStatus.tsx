import { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { clearDualWriteFailures, listDualWriteFailures } from '../../../lib/dualWriteEscala';
import {
  fetchEscalaOutboxStatus,
  flushEscalaOutboxBestEffort,
  type EscalaOutboxStatus,
} from '../../../lib/escalaOutbox';
import { getOperationalSloSummary } from '../../../lib/operationalSlo';
import { getReleaseChannel } from '../../../lib/releaseChannel';
import type { SnapshotSaudeNuvem } from '../../configuracoes/services/snapshotSaudeNuvem.service';
import type { DashboardCloudPanel } from '../types/dashboard.types';

type Props = {
  panel: DashboardCloudPanel;
  snapshotSaude: SnapshotSaudeNuvem | null;
  lastRefreshLabel: string;
  refreshing?: boolean;
  onRefresh: () => void;
};

function snapshotTone(nivel: SnapshotSaudeNuvem['nivel'] | undefined): 'ok' | 'warning' | 'danger' | 'neutral' {
  if (nivel === 'ok') return 'ok';
  if (nivel === 'aviso') return 'warning';
  if (nivel === 'critico') return 'danger';
  return 'neutral';
}

export function DashboardNuvemStatus({
  panel,
  snapshotSaude,
  lastRefreshLabel,
  refreshing,
  onRefresh,
}: Props) {
  const pulseCritical = panel.status === 'missing';
  const sizeTone = snapshotTone(snapshotSaude?.nivel);
  const liveTone = panel.status === 'ready' ? 'ok' : panel.status === 'partial' ? 'warn' : 'danger';
  const snapshotValue =
    panel.status === 'missing' ? '—' : snapshotSaude ? snapshotSaude.payloadLabel : refreshing ? '…' : '—';
  const dualFailures = listDualWriteFailures();
  const slo = getOperationalSloSummary();
  const channel = getReleaseChannel();
  const [outbox, setOutbox] = useState<EscalaOutboxStatus | null>(null);
  const [flushing, setFlushing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchEscalaOutboxStatus().then((status) => {
      if (!cancelled) setOutbox(status);
    });
    return () => {
      cancelled = true;
    };
  }, [lastRefreshLabel, refreshing]);

  const outboxFailed = outbox?.failed ?? 0;
  const outboxPending = (outbox?.pending ?? 0) + (outbox?.processing ?? 0);
  const escalaProblems = outboxFailed + dualFailures.length;
  const dualTone = escalaProblems > 0 ? 'warn' : outboxPending > 0 ? 'warn' : 'ok';
  const escalaValue =
    outbox == null && dualFailures.length === 0
      ? 'OK'
      : outboxFailed > 0
        ? `${outboxFailed} falha(s)`
        : outboxPending > 0
          ? `${outboxPending} na fila`
          : dualFailures.length > 0
            ? `${dualFailures.length} local`
            : 'OK';
  const escalaMeta =
    outboxFailed > 0
      ? (outbox?.failures ?? [])
          .map((f) => f.domain)
          .filter(Boolean)
          .slice(0, 4)
          .join(', ') || 'Outbox servidor'
      : outboxPending > 0
        ? 'A sincronizar tabelas de escala'
        : dualFailures.length > 0
          ? dualFailures.map((f) => f.domain).join(', ')
          : 'Tabelas de escala alinhadas';

  return (
    <section
      className={`dashboard-nuvem dashboard-nuvem--dense dashboard-nuvem--${panel.tone} ${pulseCritical ? 'dashboard-nuvem--pulse' : ''}`}
    >
      <div className="dashboard-nuvem__head dashboard-nuvem__head--dense">
        <div className="dashboard-nuvem__head-left">
          <h3>Nuvem</h3>
          <span className={`dashboard-live-pill dashboard-live-pill--${liveTone}`}>
            <span className="dashboard-live-pill__dot" aria-hidden />
            {panel.status === 'ready' ? 'Online' : panel.status === 'partial' ? 'Parcial' : 'Offline'}
          </span>
        </div>
        <div className="dashboard-nuvem__head-actions">
          <span className="dashboard-nuvem__sync-meta">{lastRefreshLabel}</span>
          <Button disabled={refreshing} onClick={onRefresh} type="button" variant="ghost">
            {refreshing ? '…' : 'Atualizar'}
          </Button>
        </div>
      </div>

      <div className="dashboard-widget-row">
        <article className={`dashboard-widget dashboard-widget--${liveTone}`}>
          <span className="dashboard-widget__label">Ligação</span>
          <strong className="dashboard-widget__value">{panel.title}</strong>
          <span className="dashboard-widget__meta">
            Materiais {panel.materiaisNuvem ? 'activos' : 'inactivos'}
          </span>
        </article>

        <article className={`dashboard-widget dashboard-widget--${sizeTone}`}>
          <span className="dashboard-widget__label">Snapshot</span>
          <strong className="dashboard-widget__value dashboard-widget__value--mono">{snapshotValue}</strong>
          <span className="dashboard-widget__meta">Postgres · tenant activo</span>
          {snapshotSaude && sizeTone !== 'ok' && sizeTone !== 'neutral' ? (
            <div
              className={`dashboard-widget__bar dashboard-widget__bar--${sizeTone}`}
              role="progressbar"
              aria-label="Volume do snapshot"
            >
              <span style={{ width: sizeTone === 'danger' ? '92%' : '68%' }} />
            </div>
          ) : (
            <div className="dashboard-widget__bar dashboard-widget__bar--ok" role="presentation">
              <span style={{ width: panel.status === 'ready' ? '18%' : '8%' }} />
            </div>
          )}
        </article>

        <article className={`dashboard-widget dashboard-widget--${slo.tone === 'ok' ? 'ok' : slo.tone === 'warn' ? 'warn' : 'danger'}`}>
          <span className="dashboard-widget__label">SLO 24h</span>
          <strong className="dashboard-widget__value">{slo.label}</strong>
          <span className="dashboard-widget__meta">
            Conflitos {slo.snapshotConflicts} · sync {slo.dualWriteFailures}
            {channel === 'canary' ? ' · canary' : ''}
          </span>
        </article>

        <article className={`dashboard-widget dashboard-widget--${dualTone}`}>
          <span className="dashboard-widget__label">Escala</span>
          <strong className="dashboard-widget__value">{escalaValue}</strong>
          <span className="dashboard-widget__meta">{escalaMeta}</span>
          {outboxPending > 0 || outboxFailed > 0 || dualFailures.length > 0 ? (
            <Button
              disabled={flushing}
              onClick={() => {
                setFlushing(true);
                void flushEscalaOutboxBestEffort(8)
                  .then(() => fetchEscalaOutboxStatus())
                  .then((status) => setOutbox(status))
                  .finally(() => {
                    if (dualFailures.length > 0) clearDualWriteFailures();
                    setFlushing(false);
                    onRefresh();
                  });
              }}
              type="button"
              variant="ghost"
            >
              {flushing ? 'A sincronizar…' : outboxPending > 0 || outboxFailed > 0 ? 'Sincronizar fila' : 'Limpar aviso'}
            </Button>
          ) : null}
        </article>
      </div>
    </section>
  );
}
