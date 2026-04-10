import type { ReactNode } from 'react';

type Props = {
  tone?: 'neutral' | 'warning' | 'critical';
  children: ReactNode;
};

export function OperationalNotice({ tone = 'neutral', children }: Props) {
  const toneClass =
    tone === 'critical' ? 'critical-panel' : tone === 'warning' ? 'warning-panel' : 'neutral-panel';

  return <div className={`status-panel ${toneClass}`}>{children}</div>;
}
