import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { hasSupabaseConfig } from '../../../lib/supabase';
import {
  auditarRlsJwtEstadoAdmin,
  labelOrigemComando,
  listarAtendimentoComandosAdmin,
  listarMobileSyncHealthAlertsAdmin,
  reprocessarAtendimentoComandoAdmin,
} from '../services/atendimentoSyncAdmin.service';
import type { AtendimentoSyncAdminResumo, MobileSyncHealthResumo, RlsJwtEstadoResumo } from '../types/atendimentoSyncAdmin.types';
import { isIsoProJwtSessionActive } from '../../../lib/isoProJwtSession';

function formatData(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

type Props = {
  canAdminister: boolean;
};

export function AtendimentoSyncAdminPanel({ canAdminister }: Props) {
  const cloudOk = hasSupabaseConfig();
  const [loading, setLoading] = useState(false);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [resumo, setResumo] = useState<AtendimentoSyncAdminResumo | null>(null);
  const [mobileHealth, setMobileHealth] = useState<MobileSyncHealthResumo | null>(null);
  const [rls, setRls] = useState<RlsJwtEstadoResumo | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [r, rlsState, mobileAlerts] = await Promise.all([
        listarAtendimentoComandosAdmin({ limit: 50 }),
        auditarRlsJwtEstadoAdmin(),
        listarMobileSyncHealthAlertsAdmin({ hours: 24 }),
      ]);
      setResumo(r);
      setRls(rlsState);
      setMobileHealth(mobileAlerts);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleReprocessar = useCallback(
    async (comandoId: string) => {
      setReprocessingId(comandoId);
      setActionMessage(null);
      try {
        const result = await reprocessarAtendimentoComandoAdmin(comandoId);
        if (result.ok) {
          setActionMessage('Comando reprocessado com sucesso.');
          await reload();
        } else {
          setActionMessage(result.error ?? 'Falha ao reprocessar.');
        }
      } finally {
        setReprocessingId(null);
      }
    },
    [reload],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!canAdminister) return null;

  return (
    <section className="stack-grid" style={{ gap: 12, marginTop: 24 }}>
      <div className="panel-header panel-header--toolbar">
        <div>
          <p className="panel-kicker">Operacao</p>
          <h3>Sincronizacao de atendimento (nuvem)</h3>
        </div>
        <div className="panel-toolbar">
          <Button variant="ghost" onClick={() => void reload()} disabled={loading}>
            {loading ? 'A carregar…' : 'Atualizar auditoria'}
          </Button>
        </div>
      </div>

      <OperationalNotice>
        Auditoria dos comandos idempotentes enviados pelo <strong>mobile</strong> e pelo <strong>PC</strong>. Cada linha representa uma
        baixa ou operacao registada via <code>iso_pro_submit_atendimento_comando</code>.{' '}
        <a href="/checklist-ativacao-jwt.html" target="_blank" rel="noopener noreferrer">
          Checklist JWT (TI)
        </a>
      </OperationalNotice>

      {!cloudOk ? (
        <OperationalNotice tone="warning">Configure o Supabase em Configuracoes para ver a auditoria de sync.</OperationalNotice>
      ) : null}

      {resumo?.warning ? <OperationalNotice tone="warning">{resumo.warning}</OperationalNotice> : null}
      {actionMessage ? <OperationalNotice tone="neutral">{actionMessage}</OperationalNotice> : null}
      {mobileHealth?.warning ? <OperationalNotice tone="warning">{mobileHealth.warning}</OperationalNotice> : null}

      {mobileHealth?.alertCount ? (
        <OperationalNotice tone="critical">
          <strong>{mobileHealth.alertCount}</strong> dispositivo(s) mobile com fila offline activa (ultimas 24h).
        </OperationalNotice>
      ) : null}

      {rls?.warning ? <OperationalNotice tone="warning">{rls.warning}</OperationalNotice> : null}

      {rls ? (
        <OperationalNotice tone={rls.modo === 'jwt_forte' ? 'neutral' : rls.modo === 'jwt_desalinhado' ? 'critical' : 'warning'}>
          <strong>Seguranca RLS/JWT:</strong> modo <code>{rls.modo}</code> · role <code>{rls.authRole}</code> · sessao JWT local{' '}
          {isIsoProJwtSessionActive() ? 'activa' : 'inactiva'} · memberships Auth: <strong>{rls.authMemberships}</strong> · RLS comandos:{' '}
          <strong>{rls.comandosRls ? 'ligado' : 'pendente migration'}</strong>
        </OperationalNotice>
      ) : null}

      {resumo?.pendentes ? (
        <OperationalNotice tone="critical">
          <strong>{resumo.pendentes}</strong> comando(s) sem confirmacao na nuvem (<code>snapshot_updated_at</code> vazio). Investigue
          conflitos OCC ou migration em falta.
        </OperationalNotice>
      ) : null}

      {resumo ? (
        <div className="inline-actions" style={{ gap: 16, flexWrap: 'wrap' }}>
          <span>
            Total registado: <strong>{resumo.total}</strong>
          </span>
          <span>
            Sucesso 24h: <strong>{resumo.sucesso24h}</strong>
          </span>
          <span>
            Pendentes: <strong>{resumo.pendentes}</strong>
          </span>
          <span>
            Fonte: <strong>{resumo.source === 'supabase' ? 'Supabase' : 'Indisponivel'}</strong>
          </span>
        </div>
      ) : null}

      {mobileHealth?.items.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Dispositivo</th>
                <th>Versao app</th>
                <th>Fila offline</th>
                <th>Reportado</th>
              </tr>
            </thead>
            <tbody>
              {mobileHealth.items.map((item) => (
                <tr key={item.deviceId}>
                  <td>{item.deviceLabel ?? item.deviceId}</td>
                  <td>{item.appVersion}</td>
                  <td>
                    <strong>{item.queueSize}</strong>
                  </td>
                  <td>{formatData(item.reportedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Origem</th>
              <th>Estado</th>
              <th>Itens hist.</th>
              <th>Desenhos</th>
              <th>ATDs</th>
              <th>Estornos</th>
              <th>Chave idempotencia</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {!resumo?.items.length ? (
              <tr>
                <td colSpan={9}>{loading ? 'A carregar…' : 'Nenhum comando registado ainda.'}</td>
              </tr>
            ) : (
              resumo.items.map((item) => (
                <tr key={item.id}>
                  <td>{formatData(item.createdAt)}</td>
                  <td>{labelOrigemComando(item.origem)}</td>
                  <td>
                    <span className={item.status === 'ok' ? 'status-badge status-badge--ok' : 'status-badge status-badge--warn'}>
                      {item.status === 'ok' ? 'Confirmado' : 'Pendente'}
                    </span>
                  </td>
                  <td>{item.historicoCount}</td>
                  <td>{item.documentosCount}</td>
                  <td>{item.atendimentosCount}</td>
                  <td>{item.estornoCount}</td>
                  <td>
                    <code style={{ fontSize: '0.82rem' }}>{item.idempotencyKey}</code>
                  </td>
                  <td>
                    {item.status === 'pendente' ? (
                      <Button
                        variant="ghost"
                        onClick={() => void handleReprocessar(item.id)}
                        disabled={reprocessingId === item.id || loading}
                      >
                        {reprocessingId === item.id ? 'A reprocessar…' : 'Reprocessar'}
                      </Button>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
