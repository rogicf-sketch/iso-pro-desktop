import { useCallback, useEffect, useMemo, useState } from 'react';
import { APP_VERSION } from '../../../appMeta';
import { readEstadoAmbientes } from '../../../lib/isoProAmbiente';
import { getStorageHealthSnapshot, type StorageHealthSnapshot } from '../../../lib/storageHealth';
import { fetchSupabaseQuotaUsage, type SupabaseQuotaUsage } from '../../../lib/supabaseQuotaUsage';
import { DashboardAlertas } from '../components/DashboardAlertas';
import { DashboardCards } from '../components/DashboardCards';
import { DashboardNuvemStatus } from '../components/DashboardNuvemStatus';
import { DashboardSistemaAmbiente } from '../components/DashboardSistemaAmbiente';
import { getDashboardAlerts, getDashboardCloudPanel, getDashboardIndicators } from '../services/dashboard.service';
import {
  avaliarSaudeSnapshotNuvem,
  type SnapshotSaudeNuvem,
} from '../../configuracoes/services/snapshotSaudeNuvem.service';
import { processarAlertaEstoqueEmailAutomatico } from '../../materiais/services/alertaEstoqueEmail.service';
import { processarAlertaOperacionalEmailAutomatico } from '../services/alertaOperacionalEmail.service';
import type { DashboardAlert, DashboardCloudPanel, DashboardIndicator } from '../types/dashboard.types';

const AUTO_REFRESH_MS = 60_000;

function formatRefreshLabel(date: Date): string {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function DashboardPage() {
  const [indicators, setIndicators] = useState<DashboardIndicator[]>([]);
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [cloudPanel, setCloudPanel] = useState<DashboardCloudPanel>(() => getDashboardCloudPanel());
  const [snapshotSaude, setSnapshotSaude] = useState<SnapshotSaudeNuvem | null>(null);
  const [quotaUsage, setQuotaUsage] = useState<SupabaseQuotaUsage | null>(null);
  const [sistemaSnapshot, setSistemaSnapshot] = useState<StorageHealthSnapshot | null>(null);
  const [sistemaLoading, setSistemaLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(() => new Date());
  const [clock, setClock] = useState(() => new Date());

  const ambienteNome = useMemo(() => {
    const estado = readEstadoAmbientes();
    return estado.ambientes.find((a) => a.id === estado.ativoId)?.nome ?? 'Principal';
  }, []);

  const loadAll = useCallback(async () => {
    setRefreshing(true);
    setSistemaLoading(true);
    try {
      const [ind, al, snap, saudeNuvem, quota] = await Promise.all([
        getDashboardIndicators(),
        getDashboardAlerts(),
        getStorageHealthSnapshot(),
        avaliarSaudeSnapshotNuvem().then((r) => (r.success ? (r.data ?? null) : null)).catch(() => null),
        fetchSupabaseQuotaUsage().catch(() => null),
      ]);
      setIndicators(ind);
      setAlerts(al);
      setSistemaSnapshot(snap);
      setSnapshotSaude(saudeNuvem);
      setQuotaUsage(quota);
      setCloudPanel(getDashboardCloudPanel());
      setLastRefresh(new Date());
      void processarAlertaEstoqueEmailAutomatico();
      void processarAlertaOperacionalEmailAutomatico();
    } finally {
      setRefreshing(false);
      setSistemaLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadAll();
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [loadAll]);

  /** Relógio local — zero impacto na nuvem. */
  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const alertasCriticos = alerts.filter((a) => a.severity === 'critical').length;
  const alertasAtencao = alerts.filter((a) => a.severity === 'warning').length;
  const opsOk = cloudPanel.status === 'ready' && alertasCriticos === 0;
  const opsLabel = cloudPanel.status === 'missing'
    ? 'Nuvem offline'
    : cloudPanel.status === 'partial'
      ? 'Nuvem parcial'
      : alertasCriticos > 0
        ? 'Atenção operacional'
        : 'Operacional';

  return (
    <div className="panel dashboard-panel dashboard-panel--console dashboard-panel--dense">
      <header className="dashboard-console-hero dashboard-console-hero--dense">
        <div className="dashboard-console-hero__brand">
          <div className="dashboard-console-hero__mark" aria-hidden>
            <span />
          </div>
          <div>
            <p className="dashboard-console-hero__kicker">I.S.O PRO · Saúde do sistema</p>
            <h2 className="dashboard-console-hero__title">Centro de operação</h2>
          </div>
        </div>

        <div className="dashboard-console-hero__aside">
          <div
            className={`dashboard-console-status dashboard-console-status--${opsOk ? 'ok' : alertasCriticos > 0 || cloudPanel.status === 'missing' ? 'danger' : 'warn'}`}
          >
            <span className="dashboard-console-status__dot" aria-hidden />
            <span>{opsLabel}</span>
          </div>
          <div className="dashboard-console-chips">
            {alertasCriticos > 0 ? (
              <span className="dashboard-console-chip dashboard-console-chip--danger" title="Alertas críticos abertos">
                {alertasCriticos} crítico{alertasCriticos === 1 ? '' : 's'}
              </span>
            ) : null}
            {alertasAtencao > 0 ? (
              <span className="dashboard-console-chip dashboard-console-chip--warn">
                {alertasAtencao} atenção
              </span>
            ) : null}
            <span className="dashboard-console-chip dashboard-console-chip--mono" title="Hora local do posto">
              {formatClock(clock)}
            </span>
            <span className="dashboard-console-chip dashboard-console-chip--mono">v{APP_VERSION}</span>
          </div>
        </div>
      </header>

      <div className="dashboard-console-strip dashboard-console-strip--dense" aria-label="Resumo rápido">
        <div className="dashboard-console-strip__item">
          <span className="dashboard-console-strip__label">Ambiente</span>
          <strong>{ambienteNome}</strong>
        </div>
        <div className="dashboard-console-strip__item">
          <span className="dashboard-console-strip__label">Ligação</span>
          <strong className={cloudPanel.status === 'ready' ? 'is-ok' : cloudPanel.status === 'partial' ? 'is-warn' : 'is-danger'}>
            {cloudPanel.status === 'ready' ? 'Supabase OK' : cloudPanel.status === 'partial' ? 'Incompleta' : 'Ausente'}
          </strong>
        </div>
        <div className="dashboard-console-strip__item">
          <span className="dashboard-console-strip__label">Snapshot</span>
          <strong>{snapshotSaude?.payloadLabel ?? (refreshing ? '…' : '—')}</strong>
        </div>
        <div className="dashboard-console-strip__item">
          <span className="dashboard-console-strip__label">Sync</span>
          <strong className="dashboard-console-strip__mono">{formatRefreshLabel(lastRefresh)}</strong>
        </div>
        <div className="dashboard-console-strip__item">
          <span className="dashboard-console-strip__label">Refresh</span>
          <strong>{AUTO_REFRESH_MS / 1000}s</strong>
        </div>
      </div>

      <DashboardNuvemStatus
        lastRefreshLabel={formatRefreshLabel(lastRefresh)}
        onRefresh={() => void loadAll()}
        panel={cloudPanel}
        quotaUsage={quotaUsage}
        refreshing={refreshing}
        snapshotSaude={snapshotSaude}
      />

      <DashboardSistemaAmbiente loading={sistemaLoading} onRefresh={() => void loadAll()} snapshot={sistemaSnapshot} />

      <div className="section-block dashboard-section-kpis dashboard-section--dense">
        <div className="dashboard-section-head dashboard-section-head--dense">
          <h3>Operação</h3>
        </div>
        <DashboardCards items={indicators} loading={refreshing && indicators.length === 0} replayKey={lastRefresh.getTime()} />
      </div>

      <div className="section-block dashboard-section-alerts dashboard-section--dense">
        <div className="dashboard-section-head dashboard-section-head--dense">
          <h3>Alertas</h3>
        </div>
        <DashboardAlertas items={alerts} />
      </div>

      <footer className="dashboard-footer dashboard-footer--console">
        <span>
          I.S.O PRO <strong>v{APP_VERSION}</strong>
        </span>
        <span>{ambienteNome}</span>
        <span>Refresh {AUTO_REFRESH_MS / 1000}s</span>
      </footer>
    </div>
  );
}
