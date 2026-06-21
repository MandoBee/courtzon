import type { ReactNode, HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: boolean;
}

export function Card({ children, padding = true, className = '', ...props }: CardProps) {
  return (
    <div
      className={`cz-card bg-[var(--color-surface)] ${padding ? '' : '!p-0'} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
