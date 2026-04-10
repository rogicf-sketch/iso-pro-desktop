import type { DashboardAlert } from '../types/dashboard.types';

type Props = {
  items: DashboardAlert[];
};

export function DashboardAlertas({ items }: Props) {
  return (
    <div className="stack-grid">
      {items.map((item) => (
        <article className="info-card" key={item.title}>
          <strong>{item.title}</strong>
          <p className="panel-copy">{item.detail}</p>
        </article>
      ))}
    </div>
  );
}
