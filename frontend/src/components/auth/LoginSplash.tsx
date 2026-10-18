import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { useTranslation } from '../../i18n';
import SiteBrand from '../branding/SiteBrand';
import { LOGIN_SPLASH_KEY } from '../../constants/login-splash';

const DISPLAY_MS = 2600;
const FADE_MS = 400;

export default function LoginSplash() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);
  const dismissedRef = useRef(false);

  // Latest pathname, always current inside the deferred timer callback.
  const currentPathRef = useRef(location.pathname);
  currentPathRef.current = location.pathname;
  // Pathname when the splash appeared (the user's landing route).
  const splashPathRef = useRef<string | null>(null);

  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setFading(true);
    window.setTimeout(() => {
      sessionStorage.removeItem(LOGIN_SPLASH_KEY);
      setVisible(false);
      setFading(false);
      // Send the user to their player home ONLY if they have not navigated at any
      // point while the welcome splash was visible. Without this guard the
      // deferred redirect silently overrides an intentional in-app navigation
      // (or deep link) performed during the splash/fade window.
      if (splashPathRef.current === currentPathRef.current) {
        navigate('/app', { replace: true });
      }
    }, FADE_MS);
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    if (sessionStorage.getItem(LOGIN_SPLASH_KEY) !== '1') return;
    // Capture the landing route once, on the first effect run. Guarding with the
    // null check keeps the original landing route even if this effect re-runs
    // (e.g. the auth store replaces the user object during the splash).
    if (splashPathRef.current === null) splashPathRef.current = currentPathRef.current;
    setVisible(true);
    const timer = window.setTimeout(dismiss, DISPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [user, dismiss]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label={t('home.welcome', { name: user?.fullName || 'User' })}
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-[var(--color-bg)] transition-opacity duration-300 ${
        fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      onClick={dismiss}
    >
      <div className="px-8 text-center">
        <SiteBrand size="lg" />
        <h1 className="mt-8 text-2xl md:text-3xl font-bold text-[var(--color-text)]">
          {t('home.welcome', { name: user?.fullName || 'User' })}
        </h1>
        <p className="mt-3 text-base md:text-lg text-[var(--color-text-muted)]">{t('app.tagline')}</p>
      </div>
    </div>
  );
}
