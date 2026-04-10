import type { DashboardIndicator } from '../types/dashboard.types';

type Props = {
  items: DashboardIndicator[];
};

export function DashboardCards({ items }: Props) {
  return (
    <div className="cards-grid">
      {items.map((item) => (
        <article className="metric-card" key={item.label}>
          <span className="metric-label">{item.label}</span>
          <strong>{item.value}</strong>
          <p className="panel-copy">{item.helper}</p>
        </article>
      ))}
    </div>
  );
}
