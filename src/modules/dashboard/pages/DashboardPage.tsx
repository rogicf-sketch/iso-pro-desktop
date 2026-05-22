import { useCallback, useEffect, useMemo, useState } from 'react';
import { APP_VERSION } from '../../../appMeta';
import { readEstadoAmbientes } from '../../../lib/isoProAmbiente';
import { getStorageHealthSnapshot, type StorageHealthSnapshot } from '../../../lib/storageHealth';
import { DashboardAlertas } from '../components/DashboardAlertas';
import { DashboardCards } from '../components/DashboardCards';
import { DashboardNuvemStatus } from '../components/DashboardNuvemStatus';
import { DashboardSistemaAmbiente } from '../components/DashboardSistemaAmbiente';
import { getDashboardAlerts, getDashboardCloudPanel, getDashboardIndicators } from '../services/dashboard.service';
import type { DashboardAlert, DashboardCloudPanel, DashboardIndicator } from '../types/dashboard.types';

const AUTO_REFRESH_MS = 60_000;

function formatRefreshLabel(date: Date): string {
  return `Atualizado as ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}

export function DashboardPage() {
  const [indicators, setIndicators] = useState<DashboardIndicator[]>([]);
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [cloudPanel, setCloudPanel] = useState<DashboardCloudPanel>(() => getDashboardCloudPanel());
  const [sistemaSnapshot, setSistemaSnapshot] = useState<StorageHealthSnapshot | null>(null);
  const [sistemaLoading, setSistemaLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(() => new Date());

  const ambienteNome = useMemo(() => {
    const estado = readEstadoAmbientes();
    return estado.ambientes.find((a) => a.id === estado.ativoId)?.nome ?? 'Principal';
  }, []);

  const loadAll = useCallback(async () => {
    setRefreshing(true);
    setSistemaLoading(true);
    try {
      const [ind, al, snap] = await Promise.all([
        getDashboardIndicators(),
        getDashboardAlerts(),
        getStorageHealthSnapshot(),
      ]);
      setIndicators(ind);
      setAlerts(al);
      setSistemaSnapshot(snap);
      setCloudPanel(getDashboardCloudPanel());
      setLastRefresh(new Date());
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

  return (
    <div className="panel dashboard-panel">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Painel</p>
          <h2>Visao geral da operacao</h2>
        </div>
      </div>

      <DashboardNuvemStatus
        lastRefreshLabel={formatRefreshLabel(lastRefresh)}
        onRefresh={() => void loadAll()}
        panel={cloudPanel}
        refreshing={refreshing}
      />

      <div className="section-block dashboard-section-kpis">
        <div>
          <p className="panel-kicker">Indicadores</p>
          <h3>Operacao em tempo quase real</h3>
          <p className="panel-copy dashboard-section-lead">
            Valores consolidados da fonte actual (nuvem quando configurada). Clique num cartao para abrir o modulo.
          </p>
        </div>
        <DashboardCards items={indicators} />
      </div>

      <DashboardSistemaAmbiente loading={sistemaLoading} onRefresh={() => void loadAll()} snapshot={sistemaSnapshot} />

      <div className="section-block">
        <div>
          <p className="panel-kicker">Alertas operacionais</p>
          <h3>Pontos que pedem atencao</h3>
        </div>
        <DashboardAlertas items={alerts} />
      </div>

      <footer className="dashboard-footer">
        <span>
          I.S.O PRO <strong>v{APP_VERSION}</strong>
        </span>
        <span>Ambiente: {ambienteNome}</span>
        <span>Atualizacao automatica a cada {AUTO_REFRESH_MS / 1000}s neste painel</span>
      </footer>
    </div>
  );
}
