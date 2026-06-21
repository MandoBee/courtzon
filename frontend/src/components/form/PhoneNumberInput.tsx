import {
  LOCAL_PHONE_LENGTH,
  PHONE_PLACEHOLDER,
  normalizePhoneDigits,
} from '../../utils/phone';

interface PhoneNumberInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  hint?: string;
  label?: string;
  required?: boolean;
  className?: string;
  id?: string;
}

export default function PhoneNumberInput({
  value,
  onChange,
  onBlur,
  error,
  hint,
  label,
  required,
  className = '',
  id = 'phoneNumber',
}: PhoneNumberInputProps) {
  const inputClass =
    'w-full px-4 py-3 rounded-xl border bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] outline-none ' +
    (error
      ? 'border-[var(--color-error)]'
      : 'border-[var(--color-border)]');

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
          {label}
          {required ? ' *' : ''}
        </label>
      )}
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        maxLength={LOCAL_PHONE_LENGTH}
        placeholder={PHONE_PLACEHOLDER}
        value={value}
        onChange={(e) => onChange(normalizePhoneDigits(e.target.value))}
        onBlur={onBlur}
        required={required}
        className={inputClass}
      />
      {error && <p className="text-xs text-[var(--color-error)] mt-1">{error}</p>}
      {!error && hint && <p className="text-xs text-[var(--color-text-muted)] mt-1">{hint}</p>}
    </div>
  );
}
