import type { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

export function Card({ hover, className = '', children, ...rest }: CardProps) {
  return (
    <div className={`ui-card ${hover ? 'ui-card--hover' : ''} ${className}`} {...rest}>
      {children}
    </div>
  );
}
