import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Mensagens verdes somem sozinhas em todo o sistema. */
export const SUCCESS_NOTICE_AUTO_HIDE_MS = 4500;

type Props = {
  tone?: 'neutral' | 'warning' | 'critical' | 'success';
  children: ReactNode;
  /**
   * Tempo ate esconder. Success usa 4500ms por defeito.
   * Passe 0 para manter visivel (avisos persistentes).
   */
  autoHideMs?: number;
  /** Chamado ao esconder (ex.: limpar estado `success` no modulo). */
  onAutoHide?: () => void;
};

function contentSignature(children: ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(contentSignature).join('\u0001');
  return '';
}

export function OperationalNotice({
  tone = 'neutral',
  children,
  autoHideMs,
  onAutoHide,
}: Props) {
  const [hidden, setHidden] = useState(false);
  const onAutoHideRef = useRef(onAutoHide);
  onAutoHideRef.current = onAutoHide;

  const signature = contentSignature(children);
  const hideAfter =
    autoHideMs !== undefined ? autoHideMs : tone === 'success' ? SUCCESS_NOTICE_AUTO_HIDE_MS : 0;

  useEffect(() => {
    setHidden(false);
    if (hideAfter <= 0) return;
    const timer = window.setTimeout(() => {
      setHidden(true);
      onAutoHideRef.current?.();
    }, hideAfter);
    return () => window.clearTimeout(timer);
  }, [hideAfter, signature, tone]);

  if (hidden) return null;

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
