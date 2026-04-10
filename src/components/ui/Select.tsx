import type { ReactNode, SelectHTMLAttributes } from 'react';

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  children: ReactNode;
};

export function Select({ label, children, className = '', ...props }: Props) {
  const control = (
    <select className={`input-control${className ? ` ${className}` : ''}`} {...props}>
      {children}
    </select>
  );

  if (!label) return control;

  return (
    <label className="field">
      <span>{label}</span>
      {control}
    </label>
  );
}
