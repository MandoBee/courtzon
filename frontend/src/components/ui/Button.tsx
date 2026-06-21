import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

const variantStyles: Record<Variant, string> = {
  primary: 'bg-[var(--color-primary)] text-white hover:opacity-90 disabled:opacity-50',
  secondary: 'cz-btn-secondary border text-[var(--color-text)] hover:border-[var(--color-primary)] disabled:opacity-50',
  danger: 'bg-[var(--color-error)] text-white hover:opacity-90 disabled:opacity-50',
  ghost: 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-50',
};

const sizeStyles: Record<Size, string> = {
  sm: 'cz-btn-sm',
  md: 'cz-btn-md',
  lg: 'cz-btn-lg',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`cz-btn inline-flex items-center justify-center transition-colors ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {loading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
