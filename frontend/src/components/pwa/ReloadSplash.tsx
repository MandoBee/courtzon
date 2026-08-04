import { useEffect, useState } from 'react';
import { useThemeStore } from '../../store/theme.store';
import { useAppSettingsStore, resolveAssetUrl } from '../../store/app-settings.store';
import SiteLogo from '../branding/SiteLogo';

interface ReloadSplashProps {
  /** When false the overlay fades out over ~300ms then unmounts. */
  visible: boolean;
  /** Short loading message shown under the logo, e.g. "Loading latest version...". */
  message: string;
  /** Whether to show the spinner next to the message. */
  spinner?: boolean;
}

/**
 * Full-screen branded splash overlay shown while a PWA update is applied.
 *
 * It intentionally mirrors the official startup splash (dark background +
 * configured splash image + CourtZon logo) so the reload transition is smooth
 * with no blank screen. The parent controls `visible`; fade-out is handled here.
 */
export default function ReloadSplash({ visible, message, spinner = true }: ReloadSplashProps) {
  const [mounted, setMounted] = useState(visible);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setFading(false);
      return;
    }
    setFading(true);
    const t = setTimeout(() => setMounted(false), 300);
    return () => clearTimeout(t);
  }, [visible]);

  const themeMode = useThemeStore((s) => s.mode);
  const resolvedTheme = useThemeStore((s) => s.resolved);
  const splashLight = useAppSettingsStore((s) => s.splashImageUrl);
  const splashDark = useAppSettingsStore((s) => s.splashImageDarkUrl);
  const splashDefault = useAppSettingsStore((s) => s.splashImageDefault);

  const effectiveSplashUrl: string = (() => {
    if (splashDefault === 'dark' && themeMode === 'system') {
      return splashDark || splashLight;
    }
    return resolvedTheme === 'dark' ? (splashDark || splashLight) : (splashLight || splashDark);
  })();

  const bgStyle = effectiveSplashUrl
    ? { backgroundImage: `url(${resolveAssetUrl(effectiveSplashUrl)})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : {};

  if (!mounted) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-0 z-[130] flex flex-col items-center justify-center bg-[#0A0A0F] transition-opacity duration-300 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
      style={bgStyle}
    >
      {effectiveSplashUrl && <div className="absolute inset-0 bg-black/50" />}

      <div className="relative z-10 flex flex-col items-center">
        <SiteLogo size="lg" variant="primary" />

        <div className="mt-8 flex items-center gap-3">
          {spinner && (
            <span
              className="h-5 w-5 rounded-full border-2 border-white/25 border-t-white"
              style={{ animation: 'cz-reload-spin 0.8s linear infinite' }}
              aria-hidden="true"
            />
          )}
          <p className="text-sm font-medium text-white/80">{message}</p>
        </div>
      </div>

      <style>{`
        @keyframes cz-reload-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
