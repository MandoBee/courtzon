import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import { useToast } from '../../components/ui/Toast';
import { useAuthStore } from '../../store/auth.store';
import { resolveUserHome } from '../../store/workspace.store';

/**
 * Destination for Paymob Unified Checkout redirection (`redirection_url`).
 *
 * The backend always supplies a CourtZon `redirection_url` (a caller-provided
 * `returnUrl` when available, otherwise `/payments/return`), so paying users
 * are returned to the app instead of being stranded on Paymob's page.
 *
 * Once here we hydrate auth state and route the user:
 * - authenticated session (card registration flow) → their workspace home
 * - guest / no session (cash flow or failed payment) → /login
 */
export default function PaymentReturnPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const { t } = useTranslation();
  const { showToast } = useToast();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const success = searchParams.get('success');
    const cancelled = searchParams.get('cancelled') === 'true' || searchParams.get('success') === 'false';

    (async () => {
      await checkAuth();
      const user = useAuthStore.getState().user;

      if (cancelled) {
        showToast(t('payment.return.cancelled'), 'warning');
        navigate(user ? resolveUserHome().path : '/login', { replace: true });
        return;
      }
      if (success === 'true') {
        showToast(t('payment.return.success'), 'success');
      } else if (success === 'false') {
        showToast(t('payment.return.failed'), 'error');
      }
      navigate(user ? resolveUserHome().path : '/login', { replace: true });
    })();
  }, [searchParams, checkAuth, navigate, showToast, t]);

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <div
          className="mx-auto w-10 h-10 rounded-full border-4 border-[var(--color-primary)] border-t-transparent animate-spin"
          aria-hidden
        />
        <p className="text-[var(--color-text-muted)]">{t('payment.return.processing')}</p>
      </div>
    </div>
  );
}
