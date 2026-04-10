import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: 'primary' | 'ghost' | 'danger';
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { children, className = '', variant = 'primary', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`button button-${variant}${className ? ` ${className}` : ''}`}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
});
