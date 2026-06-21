import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

interface BaseProps {
  label?: string;
  error?: string;
  hint?: string;
  className?: string;
  prefix?: string;
}

type InputAsInput = BaseProps & InputHTMLAttributes<HTMLInputElement> & { tag?: 'input' };
type InputAsTextarea = BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement> & { tag: 'textarea' };

type InputProps = InputAsInput | InputAsTextarea;

export function Input(props: InputProps) {
  const { label, error, hint, className = '', tag = 'input', prefix, ...rest } = props;
  const inputId = (rest as any).id || label?.toLowerCase().replace(/\s+/g, '-');
  const sharedClass = `cz-form-control w-full transition-colors ${
    error ? '!border-[var(--color-error)]' : ''
  } ${className}`;

  return (
    <div>
      {label && (
        <label htmlFor={inputId} className="cz-form-label block mb-2">
          {label}
        </label>
      )}
      {tag === 'textarea' ? (
        <textarea id={inputId} className={`${sharedClass} resize-none`} {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)} />
      ) : (
        <div className="flex items-center">
          {prefix && (
            <span className="inline-flex items-center px-3 py-2.5 rounded-l-[var(--radius-md)] border border-r-0 border-[var(--form-control-border-color)] bg-[var(--color-primary-bg)] text-[var(--color-text)] text-sm select-none">
              {prefix}
            </span>
          )}
          <input
            id={inputId}
            className={`${sharedClass} ${prefix ? 'rounded-l-none' : ''}`}
            {...(rest as InputHTMLAttributes<HTMLInputElement>)}
          />
        </div>
      )}
      {error && (
        <p className="cz-form-hint mt-1 text-[var(--color-error)]">{error}</p>
      )}
      {!error && hint && (
        <p className="cz-form-hint mt-1 text-[var(--color-success-text)] text-[var(--color-success-text)]">{hint}</p>
      )}
    </div>
  );
}
