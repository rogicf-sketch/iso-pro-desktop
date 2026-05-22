import { Button } from '../../../components/ui/Button';
import type { DashboardCloudPanel } from '../types/dashboard.types';
import { DashboardRingGauge } from './DashboardRingGauge';

type Props = {
  panel: DashboardCloudPanel;
  lastRefreshLabel: string;
  refreshing?: boolean;
  onRefresh: () => void;
};

function ringPercent(status: DashboardCloudPanel['status']): number {
  if (status === 'ready') return 100;
  if (status === 'partial') return 48;
  return 12;
}

export function DashboardNuvemStatus({ panel, lastRefreshLabel, refreshing, onRefresh }: Props) {
  const pulseCritical = panel.status === 'missing';

  return (
    <section className={`dashboard-nuvem dashboard-nuvem--${panel.tone} ${pulseCritical ? 'dashboard-nuvem--pulse' : ''}`}>
      <div className="dashboard-nuvem__head">
        <div>
          <p className="panel-kicker">Servidor</p>
          <h3>Ligacao a nuvem</h3>
        </div>
        <Button disabled={refreshing} onClick={onRefresh} type="button" variant="ghost">
          {refreshing ? 'Atualizando...' : 'Atualizar painel'}
        </Button>
      </div>

      <div className="dashboard-nuvem__body">
        <DashboardRingGauge
          label={panel.status === 'ready' ? 'OK' : panel.status === 'partial' ? '!' : '—'}
          percent={ringPercent(panel.status)}
          sublabel="referencia"
          tone={panel.tone}
        />
        <div className="dashboard-nuvem__copy">
          <strong className="dashboard-nuvem__title">{panel.title}</strong>
          <p className="panel-copy">{panel.detail}</p>
          <p className="dashboard-nuvem__meta">
            Materiais em nuvem: <strong>{panel.materiaisNuvem ? 'ativado' : 'desativado ou indisponivel'}</strong>
          </p>
          <p className="dashboard-nuvem__meta dashboard-nuvem__meta--muted">{lastRefreshLabel}</p>
        </div>
      </div>
    </section>
  );
}
