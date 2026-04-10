import { useCallback, useEffect, useState } from 'react';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { getStorageHealthSnapshot, type StorageHealthSnapshot } from '../../../lib/storageHealth';
import { getSupabaseOperationalStatus } from '../../../lib/supabase';
import { DashboardAlertas } from '../components/DashboardAlertas';
import { DashboardCards } from '../components/DashboardCards';
import { DashboardSistemaAmbiente } from '../components/DashboardSistemaAmbiente';
import { getDashboardAlerts, getDashboardIndicators } from '../services/dashboard.service';
import type { DashboardAlert, DashboardIndicator } from '../types/dashboard.types';

export function DashboardPage() {
  const [indicators, setIndicators] = useState<DashboardIndicator[]>([]);
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [sistemaSnapshot, setSistemaSnapshot] = useState<StorageHealthSnapshot | null>(null);
  const [sistemaLoading, setSistemaLoading] = useState(true);
  const cloudStatus = getSupabaseOperationalStatus();

  const loadSistema = useCallback(async () => {
    setSistemaLoading(true);
    try {
      setSistemaSnapshot(await getStorageHealthSnapshot());
    } finally {
      setSistemaLoading(false);
    }
  }, []);

  useEffect(() => {
    void getDashboardIndicators().then(setIndicators);
    void getDashboardAlerts().then(setAlerts);
  }, []);

  useEffect(() => {
    void loadSistema();
  }, [loadSistema]);

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Painel</p>
          <h2>Visão geral da operação</h2>
        </div>
      </div>

      <OperationalNotice>
        {cloudStatus === 'ready'
          ? 'Fonte atual: Supabase. Dashboard consolidando indicadores da operacao em nuvem.'
          : cloudStatus === 'partial'
            ? 'Fonte atual: fallback local. Configuracao do Supabase incompleta; dashboard consolidando base local.'
            : 'Fonte atual: fallback local. Dashboard consolidando dados da base local.'}
      </OperationalNotice>

      <DashboardSistemaAmbiente loading={sistemaLoading} onRefresh={() => void loadSistema()} snapshot={sistemaSnapshot} />

      <DashboardCards items={indicators} />

      <div className="section-block">
        <div>
          <p className="panel-kicker">Alertas operacionais</p>
          <h3>Pontos que pedem atencao</h3>
        </div>
        <DashboardAlertas items={alerts} />
      </div>
    </div>
  );
}
