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
import type { SupabaseQuotaUsage } from '../../../lib/supabaseQuotaUsage';
import type { SnapshotSaudeNuvem } from '../../configuracoes/services/snapshotSaudeNuvem.service';
import type { DashboardCloudPanel } from '../types/dashboard.types';
import { DashboardRingGauge } from './DashboardRingGauge';

type Props = {
  panel: DashboardCloudPanel;
  snapshotSaude: SnapshotSaudeNuvem | null;
  quotaUsage: SupabaseQuotaUsage | null;
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

function barWidth(pct: number): string {
  return `${Math.min(100, Math.max(2, Math.round(pct)))}%`;
}

export function DashboardNuvemStatus({
  panel,
  snapshotSaude,
  quotaUsage,
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

  const dbTone = quotaUsage?.databaseTone ?? 'neutral';
  const stTone = quotaUsage?.storageTone ?? 'neutral';
  const quotaWaiting = !quotaUsage && refreshing;
  const quotaUnavailable = !quotaUsage && !refreshing;
  const dbUsed = quotaUsage?.databaseLabel ?? (quotaWaiting ? '…' : '—');
  const stUsed = quotaUsage?.storageLabel ?? (quotaWaiting ? '…' : '—');
  const materiaisActivos = panel.materiaisNuvem;

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
          <span
            className={`dashboard-widget__meta${materiaisActivos ? '' : ' dashboard-widget__meta--danger'}`}
          >
            Materiais {materiaisActivos ? 'activos' : 'inactivos'}
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

      <div className="dashboard-quota-row" aria-label="Cotas do plano Supabase">
        <article
          className={`dashboard-quota dashboard-quota--${dbTone}${quotaWaiting ? ' dashboard-quota--idle' : ''}${quotaUnavailable ? ' dashboard-quota--unavailable' : ''}`}
        >
          <div className="dashboard-quota__body">
            <header className="dashboard-quota__head">
              <span className="dashboard-quota__title">Base de dados</span>
              <span className="dashboard-quota__cap">8 GB</span>
            </header>
            <p className="dashboard-quota__used">
              <strong>{dbUsed}</strong>
              <span className="dashboard-quota__of"> / 8 GB</span>
            </p>
            <div
              className="dashboard-quota__track"
              role="progressbar"
              aria-valuenow={Math.round(quotaUsage?.databasePercent ?? 0)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Uso da base de dados"
            >
              <span
                className="dashboard-quota__fill"
                style={{ width: quotaUsage ? barWidth(quotaUsage.databasePercent) : '4%' }}
              />
            </div>
            {quotaUsage ? (
              <span className="dashboard-quota__pct">{quotaUsage.databaseDetail}</span>
            ) : (
              <span className="dashboard-quota__pct dashboard-quota__pct--muted">
                {quotaWaiting ? 'A ler…' : 'Migração de cota em falta'}
              </span>
            )}
          </div>
          <DashboardRingGauge
            idle={quotaWaiting}
            percent={quotaUsage?.databasePercent ?? 0}
            tone={dbTone}
            size={84}
            label={quotaUsage ? `${Math.round(quotaUsage.databasePercent)}%` : quotaWaiting ? '…' : '—'}
            sublabel="cota"
          />
        </article>

        <article
          className={`dashboard-quota dashboard-quota--${stTone}${quotaWaiting ? ' dashboard-quota--idle' : ''}${quotaUnavailable ? ' dashboard-quota--unavailable' : ''}`}
        >
          <div className="dashboard-quota__body">
            <header className="dashboard-quota__head">
              <span className="dashboard-quota__title">Storage</span>
              <span className="dashboard-quota__cap">100 GB</span>
            </header>
            <p className="dashboard-quota__used">
              <strong>{stUsed}</strong>
              <span className="dashboard-quota__of"> / 100 GB</span>
            </p>
            <div
              className="dashboard-quota__track"
              role="progressbar"
              aria-valuenow={Math.round(quotaUsage?.storagePercent ?? 0)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Uso do Storage"
            >
              <span
                className="dashboard-quota__fill"
                style={{ width: quotaUsage ? barWidth(quotaUsage.storagePercent) : '4%' }}
              />
            </div>
            {quotaUsage ? (
              <span className="dashboard-quota__pct">{quotaUsage.storageDetail}</span>
            ) : (
              <span className="dashboard-quota__pct dashboard-quota__pct--muted">
                {quotaWaiting ? 'A ler…' : 'Migração de cota em falta'}
              </span>
            )}
          </div>
          <DashboardRingGauge
            idle={quotaWaiting}
            percent={quotaUsage?.storagePercent ?? 0}
            tone={stTone}
            size={84}
            label={quotaUsage ? `${Math.round(quotaUsage.storagePercent)}%` : quotaWaiting ? '…' : '—'}
            sublabel="cota"
          />
        </article>
      </div>
    </section>
  );
}
