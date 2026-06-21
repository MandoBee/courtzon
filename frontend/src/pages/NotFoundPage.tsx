import { Link } from 'react-router-dom';
import { useTranslation } from '../i18n';

export default function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex flex-col items-center justify-center px-4 text-center">
      <div className="text-7xl font-bold text-[var(--color-primary)] mb-4">404</div>
      <h1 className="text-2xl font-semibold text-[var(--color-text)] mb-2">
        {t('common.pageNotFound') || 'Page Not Found'}
      </h1>
      <p className="text-[var(--color-text-muted)] mb-6 max-w-md">
        {t('common.pageNotFoundDescription') || "The page you're looking for doesn't exist or has been moved."}
      </p>
      <Link
        to="/"
        className="px-5 py-2.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90 transition-opacity font-medium"
      >
        {t('common.backHome') || 'Back to Home'}
      </Link>
    </div>
  );
}
