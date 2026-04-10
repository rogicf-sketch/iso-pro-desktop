import type { InputHTMLAttributes } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

export function Input({ label, className = '', ...props }: Props) {
  const control = <input className={`input-control${className ? ` ${className}` : ''}`} {...props} />;

  if (!label) return control;

  return (
    <label className="field">
      <span>{label}</span>
      {control}
    </label>
  );
}
