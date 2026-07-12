import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { hasSupabaseConfig } from '../../../lib/supabase';
import {
  auditarIntegridadeAtendimentoAdmin,
  exportarRelatorioIntegridadeCsv,
} from '../services/atendimentoIntegridadeAudit.service';
import type { AtendimentoIntegridadeRelatorio } from '../types/atendimentoIntegridadeAudit.types';

function formatData(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

function badgeClass(sev: string): string {
  if (sev === 'critico') return 'status-badge status-badge--warn';
  if (sev === 'alerta') return 'status-badge';
  return 'status-badge status-badge--ok';
}

type Props = {
  canAdminister: boolean;
};

export function AtendimentoIntegridadeAuditPanel({ canAdminister }: Props) {
  const cloudOk = hasSupabaseConfig();
  const [loading, setLoading] = useState(false);
  const [relatorio, setRelatorio] = useState<AtendimentoIntegridadeRelatorio | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await auditarIntegridadeAtendimentoAdmin();
      setRelatorio(r);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!canAdminister) return null;

  return (
    <section className="stack-grid" style={{ gap: 12, marginTop: 24 }}>
      <div className="panel-header panel-header--toolbar">
        <div>
          <p className="panel-kicker">Integridade</p>
          <h3>Auditoria total de atendimento</h3>
        </div>
        <div className="panel-toolbar">
          <Button variant="ghost" onClick={() => void reload()} disabled={loading}>
            {loading ? 'A auditar…' : 'Executar auditoria'}
          </Button>
          {relatorio?.achados.length ? (
            <Button variant="ghost" onClick={() => exportarRelatorioIntegridadeCsv(relatorio)}>
              Exportar CSV
            </Button>
          ) : null}
        </div>
      </div>

      <OperationalNotice>
        Varre o snapshot na nuvem: <strong>excesso no planejamento</strong>, <strong>mesmo material em varios lotes</strong> no
        mesmo desenho (ex. /UT-187), <strong>desenhos com multiplos ATDs</strong> e divergencias entre lotes e planejamento.
        Use antes de fechar obra ou apos suspeita de baixa duplicada.
      </OperationalNotice>

      {!cloudOk ? (
        <OperationalNotice tone="warning">Configure o Supabase em Configuracoes para executar a auditoria.</OperationalNotice>
      ) : null}

      {relatorio?.warning ? <OperationalNotice tone="warning">{relatorio.warning}</OperationalNotice> : null}

      {relatorio ? (
        <div className="inline-actions" style={{ gap: 16, flexWrap: 'wrap' }}>
          <span>
            Criticos: <strong>{relatorio.resumo.criticos}</strong>
          </span>
          <span>
            Alertas: <strong>{relatorio.resumo.alertas}</strong>
          </span>
          <span>
            Desenhos: <strong>{relatorio.resumo.documentosAuditados}</strong>
          </span>
          <span>
            Lotes concluidos: <strong>{relatorio.resumo.lotesConcluidos}</strong>
          </span>
          <span>
            Nuvem gravada: <strong>{formatData(relatorio.snapshotUpdatedAt)}</strong>
          </span>
        </div>
      ) : null}

      {relatorio?.resumo.criticos ? (
        <OperationalNotice tone="critical">
          <strong>{relatorio.resumo.criticos}</strong> achado(s) critico(s). Revise os lotes indicados e estorne os indevidos em
          Atendimento → Pesquisar lotes.
        </OperationalNotice>
      ) : relatorio && !loading ? (
        <OperationalNotice tone="neutral">Nenhum achado critico na auditoria actual.</OperationalNotice>
      ) : null}

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Severidade</th>
              <th>Codigo</th>
              <th>Desenho</th>
              <th>Material</th>
              <th>Lotes</th>
              <th>Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {!relatorio?.achados.length ? (
              <tr>
                <td colSpan={6}>{loading ? 'A auditar snapshot…' : 'Nenhum achado — sistema consistente nesta verificacao.'}</td>
              </tr>
            ) : (
              relatorio.achados.map((a, idx) => (
                <tr key={`${a.codigo}-${idx}`}>
                  <td>
                    <span className={badgeClass(a.severidade)}>{a.severidade}</span>
                  </td>
                  <td>
                    <code style={{ fontSize: '0.82rem' }}>{a.codigo}</code>
                  </td>
                  <td>{a.documentoNumero ?? '—'}</td>
                  <td>{a.codigoMaterial ?? '—'}</td>
                  <td>{(a.loteNumeros ?? []).join(' · ') || '—'}</td>
                  <td>{a.detalhe}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
