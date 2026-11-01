import type { DomainEventTypeTotal } from '../../../lib/domainEventsDailyCounts';

type Props = {
  totals: DomainEventTypeTotal[];
  windowDays: number;
  loading?: boolean;
  error?: string;
};

/**
 * Resumo P2 acima da tabela de eventos — totais por tipo (sem cards).
 */
export function UsuariosDomainEventsDailyStrip({ totals, windowDays, loading, error }: Props) {
  if (error) {
    return (
      <p className="panel-copy" style={{ marginBottom: 12 }}>
        Rollup {windowDays}d indisponivel: {error}
      </p>
    );
  }
  if (loading) {
    return (
      <p className="panel-copy" style={{ marginBottom: 12 }}>
        A carregar rollup dos ultimos {windowDays} dias...
      </p>
    );
  }
  if (!totals.length) {
    return (
      <p className="panel-copy" style={{ marginBottom: 12 }}>
        Ultimos {windowDays} dias: nenhum evento de dominio ainda.
      </p>
    );
  }

  const grand = totals.reduce((n, t) => n + t.count, 0);
  return (
    <div style={{ marginBottom: 16 }}>
      <p className="panel-copy" style={{ marginBottom: 6 }}>
        Ultimos {windowDays} dias — {grand} evento(s) no total:
      </p>
      <ul className="panel-copy" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55 }}>
        {totals.map((t) => (
          <li key={t.event_type}>
            <code>{t.event_type}</code> — {t.count}
          </li>
        ))}
      </ul>
    </div>
  );
}
