import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { APP_VERSION } from '../../../appMeta';
import { Button } from '../../../components/ui/Button';
import { readEstadoAmbientes } from '../../../lib/isoProAmbiente';
import { getStorageHealthSnapshot, type StorageHealthSnapshot } from '../../../lib/storageHealth';
import { fetchSupabaseQuotaUsage, type SupabaseQuotaUsage } from '../../../lib/supabaseQuotaUsage';
import { useAuth } from '../../auth/hooks/useAuth';
import type { AppModule, PermissionAction } from '../../auth/types/auth.types';
import { DashboardAlertas } from '../components/DashboardAlertas';
import { DashboardCards } from '../components/DashboardCards';
import { DashboardNuvemStatus } from '../components/DashboardNuvemStatus';
import { DashboardSistemaAmbiente } from '../components/DashboardSistemaAmbiente';
import {
  carregarEstoqueCriticoParaPainel,
  getDashboardAlerts,
  getDashboardCloudPanel,
  getDashboardIndicators,
  incorporarAlertaEstoqueCritico,
} from '../services/dashboard.service';
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

/**
 * Consola técnica (nuvem, cotas, posto) só para quem administra Configurações —
 * perfil de administrador do sistema. Operadores veem o painel operacional.
 */
export function canSeeDashboardInfraConsole(canAccessAction: (modulo: AppModule, acao: PermissionAction) => boolean): boolean {
  return canAccessAction('configuracoes', 'administrar');
}

export function DashboardPage() {
  const { canAccessAction, user } = useAuth();
  const showInfraConsole = canSeeDashboardInfraConsole(canAccessAction);

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
  const loadSeqRef = useRef(0);

  const ambienteNome = useMemo(() => {
    const estado = readEstadoAmbientes();
    return estado.ambientes.find((a) => a.id === estado.ativoId)?.nome ?? 'Principal';
  }, []);

  const loadAll = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setRefreshing(true);
    if (showInfraConsole) setSistemaLoading(true);
    try {
      if (showInfraConsole) {
        const [ind, al, snap, saudeNuvem, quota] = await Promise.all([
          getDashboardIndicators(),
          getDashboardAlerts(),
          getStorageHealthSnapshot(),
          avaliarSaudeSnapshotNuvem()
            .then((r) => (r.success ? (r.data ?? null) : null))
            .catch(() => null),
          fetchSupabaseQuotaUsage().catch(() => null),
        ]);
        if (seq !== loadSeqRef.current) return;
        setIndicators(ind);
        setAlerts(al);
        setSistemaSnapshot(snap);
        setSnapshotSaude(saudeNuvem);
        setQuotaUsage(quota);
      } else {
        const [ind, al] = await Promise.all([getDashboardIndicators(), getDashboardAlerts()]);
        if (seq !== loadSeqRef.current) return;
        setIndicators(ind);
        setAlerts(al);
        setSistemaSnapshot(null);
        setSnapshotSaude(null);
        setQuotaUsage(null);
      }

      setCloudPanel(getDashboardCloudPanel());
      setLastRefresh(new Date());
      void carregarEstoqueCriticoParaPainel().then((itens) => {
        if (seq !== loadSeqRef.current) return;
        setAlerts((atual) => incorporarAlertaEstoqueCritico(atual, itens));
      });
      void processarAlertaEstoqueEmailAutomatico();
      void processarAlertaOperacionalEmailAutomatico();
    } finally {
      setRefreshing(false);
      setSistemaLoading(false);
    }
  }, [showInfraConsole, user?.id]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadAll();
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [loadAll]);

  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const alertasCriticos = alerts.filter((a) => a.severity === 'critical').length;
  const alertasAtencao = alerts.filter((a) => a.severity === 'warning').length;
  const opsOk = cloudPanel.status === 'ready' && alertasCriticos === 0 && alertasAtencao === 0;
  const statusTone = opsOk ? 'ok' : alertasCriticos > 0 || cloudPanel.status === 'missing' ? 'danger' : 'warn';
  const opsLabel =
    cloudPanel.status === 'missing'
      ? 'Nuvem offline'
      : cloudPanel.status === 'partial'
        ? 'Nuvem parcial'
        : alertasCriticos > 0
          ? 'Crítico operacional'
          : alertasAtencao > 0
            ? 'Atenção operacional'
            : 'Operacional';

  const panelClass = [
    'panel',
    'dashboard-panel',
    'dashboard-panel--console',
    'dashboard-panel--dense',
    'dashboard-panel--fit',
    showInfraConsole ? 'dashboard-panel--admin' : 'dashboard-panel--ops',
  ].join(' ');

  return (
    <div className={panelClass}>
      <header className="dashboard-fit-toolbar" aria-label="Estado do sistema">
        <div className="dashboard-fit-toolbar__left">
          <div className={`dashboard-console-status dashboard-console-status--${statusTone}`}>
            <span className="dashboard-console-status__dot" aria-hidden />
            <span>{opsLabel}</span>
          </div>
          <div className="dashboard-console-chips">
            {alertasCriticos > 0 ? (
              <span className="dashboard-console-chip dashboard-console-chip--danger">
                {alertasCriticos} crítico{alertasCriticos === 1 ? '' : 's'}
              </span>
            ) : null}
            {alertasAtencao > 0 ? (
              <span className="dashboard-console-chip dashboard-console-chip--warn">{alertasAtencao} atenção</span>
            ) : null}
            <span className="dashboard-console-chip dashboard-console-chip--mono" title="Hora local">
              {formatClock(clock)}
            </span>
            {showInfraConsole ? (
              <span className="dashboard-console-chip dashboard-console-chip--mono">v{APP_VERSION}</span>
            ) : null}
          </div>
        </div>

        <div className="dashboard-fit-toolbar__meta" aria-label="Resumo rápido">
          {showInfraConsole ? (
            <>
              <div className="dashboard-fit-meta">
                <span className="dashboard-fit-meta__label">Ambiente</span>
                <strong className="dashboard-fit-meta__value" title={ambienteNome}>
                  {ambienteNome}
                </strong>
              </div>
              <div className="dashboard-fit-meta">
                <span className="dashboard-fit-meta__label">Ligação</span>
                <strong
                  className={`dashboard-fit-meta__value ${
                    cloudPanel.status === 'ready' ? 'is-ok' : cloudPanel.status === 'partial' ? 'is-warn' : 'is-danger'
                  }`}
                >
                  {cloudPanel.status === 'ready' ? 'Nuvem OK' : cloudPanel.status === 'partial' ? 'Incompleta' : 'Ausente'}
                </strong>
              </div>
              <div className="dashboard-fit-meta">
                <span className="dashboard-fit-meta__label">Snapshot</span>
                <strong className="dashboard-fit-meta__value dashboard-fit-meta__value--mono">
                  {snapshotSaude?.payloadLabel ?? (refreshing ? '…' : '—')}
                </strong>
              </div>
              <div className="dashboard-fit-meta">
                <span className="dashboard-fit-meta__label">Sync</span>
                <strong className="dashboard-fit-meta__value dashboard-fit-meta__value--mono">
                  {formatRefreshLabel(lastRefresh)}
                </strong>
              </div>
              <div className="dashboard-fit-meta">
                <span className="dashboard-fit-meta__label">Refresh</span>
                <strong className="dashboard-fit-meta__value">{AUTO_REFRESH_MS / 1000}s</strong>
              </div>
            </>
          ) : (
            <div className="dashboard-fit-meta dashboard-fit-meta--soft">
              <span className="dashboard-fit-meta__label">Actualizado</span>
              <strong className="dashboard-fit-meta__value dashboard-fit-meta__value--mono">
                {formatRefreshLabel(lastRefresh)}
              </strong>
            </div>
          )}
          <Button
            className="dashboard-fit-toolbar__refresh"
            disabled={refreshing}
            onClick={() => void loadAll()}
            type="button"
            variant="ghost"
          >
            {refreshing ? '…' : 'Atualizar'}
          </Button>
        </div>
      </header>

      {showInfraConsole ? (
        <div className="dashboard-fit-infra">
          <DashboardNuvemStatus
            lastRefreshLabel={formatRefreshLabel(lastRefresh)}
            onRefresh={() => void loadAll()}
            panel={cloudPanel}
            quotaUsage={quotaUsage}
            refreshing={refreshing}
            snapshotSaude={snapshotSaude}
          />
          <DashboardSistemaAmbiente loading={sistemaLoading} onRefresh={() => void loadAll()} snapshot={sistemaSnapshot} />
        </div>
      ) : null}

      <div className="dashboard-fit-stage">
        <section className="section-block dashboard-section-kpis dashboard-section--dense dashboard-fit-ops" aria-labelledby="dash-ops">
          <div className="dashboard-section-head dashboard-section-head--dense">
            <h3 id="dash-ops">Operação</h3>
          </div>
          <DashboardCards items={indicators} loading={refreshing && indicators.length === 0} replayKey={lastRefresh.getTime()} />
        </section>

        <section className="section-block dashboard-section-alerts dashboard-section--dense dashboard-fit-alerts" aria-labelledby="dash-alerts">
          <div className="dashboard-section-head dashboard-section-head--dense">
            <h3 id="dash-alerts">Alertas</h3>
          </div>
          <DashboardAlertas items={alerts} />
        </section>
      </div>
    </div>
  );
}
