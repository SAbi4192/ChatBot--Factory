import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'default', size = 'md', className = '', children, ...rest }, ref) => (
    <button
      ref={ref}
      className={`ui-btn ui-btn--${variant} ui-btn--${size} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
);
Button.displayName = 'Button';
