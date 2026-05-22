import { useNavigate } from 'react-router-dom';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';
import type { DashboardIndicator } from '../types/dashboard.types';

type Props = {
  items: DashboardIndicator[];
};

function toneClass(tone: DashboardIndicator['tone']): string {
  if (tone === 'ok') return 'dashboard-kpi--ok';
  if (tone === 'warning') return 'dashboard-kpi--warning';
  if (tone === 'danger') return 'dashboard-kpi--danger';
  return '';
}

function DashboardKpiCard({ item }: { item: DashboardIndicator }) {
  const navigate = useNavigate();
  const hasNumeric = typeof item.numericValue === 'number';
  const animated = useAnimatedNumber(item.numericValue ?? 0);
  const displayValue = hasNumeric ? String(animated) : item.value;
  const clickable = Boolean(item.route);

  function handleClick() {
    if (item.route) navigate(item.route);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (!clickable || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    handleClick();
  }

  return (
    <article
      className={`metric-card dashboard-kpi ${toneClass(item.tone)} ${clickable ? 'dashboard-kpi--clickable' : ''}`}
      onClick={clickable ? handleClick : undefined}
      onKeyDown={clickable ? handleKeyDown : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={clickable ? `Abrir ${item.label}` : undefined}
    >
      <span className="metric-label">{item.label}</span>
      <strong className="dashboard-kpi__value">{displayValue}</strong>
      <p className="panel-copy">{item.helper}</p>
      {clickable ? <span className="dashboard-kpi__cta">Abrir modulo</span> : null}
    </article>
  );
}

export function DashboardCards({ items }: Props) {
  return (
    <div className="cards-grid dashboard-kpi-grid">
      {items.map((item) => (
        <DashboardKpiCard item={item} key={item.label} />
      ))}
    </div>
  );
}
