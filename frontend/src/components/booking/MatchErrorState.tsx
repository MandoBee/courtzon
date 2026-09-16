import { useTranslation } from '../../i18n';

/**
 * Shared error state for match screens. Distinguishes 404 (missing match /
 * stale or crafted link), 403 (permission), 401 (session) and network/5xx
 * (retry) so the user is never shown a misleading "not found".
 */
export default function MatchErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  const status = (error as any)?.response?.status as number | undefined;

  const message =
    status === 404
      ? t('matchResult.notFound')
      : status === 403
        ? t('matchResult.forbidden')
        : status === 401
          ? t('matchResult.notAuthenticated')
          : t('matchResult.loadError');

  const retryable = status === undefined || status >= 500;

  return (
    <div className="max-w-2xl mx-auto text-center py-12">
      <p className="text-sm text-[var(--color-text-muted)]">{message}</p>
      {retryable && onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 px-4 py-2 text-sm font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90"
        >
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}