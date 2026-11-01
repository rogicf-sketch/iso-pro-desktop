import type { ReactNode } from 'react';

type Props = {
  title: string;
  description?: string;
  action?: ReactNode;
};

/**
 * Estado vazio amigável (listas e painéis) — polish de produto.
 */
export function EmptyState({ title, description, action }: Props) {
  return (
    <div className="empty-state" role="status">
      <div className="empty-state__mark" aria-hidden />
      <p className="empty-state__title">{title}</p>
      {description ? <p className="empty-state__desc">{description}</p> : null}
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}
