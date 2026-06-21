import SiteLogo from './SiteLogo';
import { useAppSettingsStore } from '../../store/app-settings.store';

interface Props {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Overrides app tagline when set (e.g. auth page subtitles). */
  subtitle?: string;
}

/** Centered logo + tagline for auth and marketing hero blocks. */
export default function SiteBrand({ className = '', size = 'lg', subtitle }: Props) {
  const siteTagline = useAppSettingsStore((s) => s.siteTagline);
  const line = subtitle ?? siteTagline;

  return (
    <div className={`text-center ${className}`}>
      <div className="flex justify-center mb-2">
        <SiteLogo to="/" size={size} variant="primary" />
      </div>
      {line && (
        <p className="text-[var(--color-text-muted)] mt-2">{line}</p>
      )}
    </div>
  );
}
