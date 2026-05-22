import { useNavigate } from 'react-router-dom';
import type { DashboardAlert } from '../types/dashboard.types';

type Props = {
  items: DashboardAlert[];
};

function severityClass(severity: DashboardAlert['severity']): string {
  return `dashboard-alert dashboard-alert--${severity}`;
}

export function DashboardAlertas({ items }: Props) {
  const navigate = useNavigate();

  if (!items.length) {
    return (
      <div className="dashboard-alert-empty">
        <strong>Operacao em dia</strong>
        <p className="panel-copy">Nenhum alerta critico ou pendencia relevante neste momento.</p>
      </div>
    );
  }

  return (
    <div className="dashboard-alert-grid">
      {items.map((item, index) => {
        const clickable = Boolean(item.route);
        return (
          <article
            className={`${severityClass(item.severity)} ${clickable ? 'dashboard-alert--clickable' : ''}`}
            key={item.title}
            onClick={clickable ? () => navigate(item.route!) : undefined}
            onKeyDown={
              clickable
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(item.route!);
                    }
                  }
                : undefined
            }
            role={clickable ? 'button' : undefined}
            style={{ animationDelay: `${index * 60}ms` }}
            tabIndex={clickable ? 0 : undefined}
          >
            <span className="dashboard-alert__badge">
              {item.severity === 'critical'
                ? 'Critico'
                : item.severity === 'warning'
                  ? 'Atencao'
                  : item.severity === 'info'
                    ? 'Info'
                    : 'OK'}
            </span>
            <strong>{item.title}</strong>
            <p className="panel-copy">{item.detail}</p>
          </article>
        );
      })}
    </div>
  );
}
