import type { ReactNode } from 'react';

type Props = {
  tone?: 'neutral' | 'warning' | 'critical' | 'success';
  children: ReactNode;
};

export function OperationalNotice({ tone = 'neutral', children }: Props) {
  const toneClass =
    tone === 'critical'
      ? 'critical-panel'
      : tone === 'warning'
        ? 'warning-panel'
        : tone === 'success'
          ? 'success-panel'
          : 'neutral-panel';

  return <div className={`status-panel ${toneClass}`}>{children}</div>;
}
