import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { setLocale, useTranslation, type Locale } from '../../i18n';

interface Language {
  id?: number;
  code: string;
  name: string;
  native_name: string;
  isRtl?: boolean;
}

interface LanguageSwitcherProps {
  className?: string;
  /** Called after the user picks a language (e.g. close mobile nav). */
  onSelect?: () => void;
}

export default function LanguageSwitcher({ className = '', onSelect }: LanguageSwitcherProps) {
  const { locale } = useTranslation();

  const { data: languages = [] } = useQuery({
    queryKey: ['public', 'languages'],
    queryFn: () => api.get('/public/languages').then((r) => r.data.data as Language[]),
    staleTime: 5 * 60 * 1000,
  });

  if (!languages.length) return null;

  const onChange = async (code: string) => {
    const lang = languages.find((l) => l.code === code);
    await setLocale(code as Locale, lang?.isRtl);
    onSelect?.();
  };

  return (
    <select
      value={locale}
      onChange={(e) => void onChange(e.target.value)}
      aria-label="Language"
      className={`h-9 min-w-[5.5rem] max-w-[8rem] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 ${className}`}
    >
      {languages.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {lang.native_name || lang.name}
        </option>
      ))}
    </select>
  );
}
