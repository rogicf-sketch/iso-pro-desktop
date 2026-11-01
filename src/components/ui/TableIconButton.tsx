import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  tone?: 'neutral' | 'danger' | 'accent';
  children: ReactNode;
};

/**
 * Botão compacto só com ícone (tabelas ERP). `label` vira title + aria-label.
 */
export function TableIconButton({
  label,
  tone = 'neutral',
  children,
  className = '',
  type = 'button',
  ...props
}: Props) {
  return (
    <button
      aria-label={label}
      className={`table-icon-btn table-icon-btn--${tone}${className ? ` ${className}` : ''}`}
      title={label}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
