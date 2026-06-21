import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import { useAuthStore } from '../../store/auth.store';
import { isOrganisationPendingApproval } from '../../utils/organisation';

const REDIRECT_MS = 5000;

export default function OrgPendingApprovalPage() {
  const navigate = useNavigate();
  const { orgId } = useParams<{ orgId: string }>();
  const user = useAuthStore((s) => s.user);
  const { t } = useTranslation();
  const [secondsLeft, setSecondsLeft] = useState(5);

  const org = user?.organisations?.find((o) => String(o.id) === orgId);
  if (!org) {
    return <Navigate to="/app" replace />;
  }
  if (!isOrganisationPendingApproval(org)) {
    return <Navigate to={`/org/${orgId}/dashboard`} replace />;
  }

  useEffect(() => {
    const redirectTimer = window.setTimeout(() => navigate('/app', { replace: true }), REDIRECT_MS);
    const tick = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => {
      window.clearTimeout(redirectTimer);
      window.clearInterval(tick);
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="text-5xl" aria-hidden>
          ⏳
        </div>
        <h1 className="text-xl font-bold text-[var(--color-text)]">
          {t('org.pendingApproval.title')}
        </h1>
        <p className="text-[var(--color-text-muted)] leading-relaxed">
          {t('org.pendingApproval.message')}
        </p>
        <p className="text-sm text-[var(--color-text-muted)]">
          {t('org.pendingApproval.redirect', { seconds: secondsLeft })}
        </p>
      </div>
    </div>
  );
}
