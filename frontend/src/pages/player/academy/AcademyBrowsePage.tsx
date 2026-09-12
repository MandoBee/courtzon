import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { publicAcademyApi, type PublicAcademyProgram } from '../../../services/academy';
import { useTranslation } from '../../../i18n';
import { SkeletonRow } from '../../../components/ui/Skeleton';

const CATEGORY_COLORS: Record<string, string> = {
  tennis: 'bg-green-100 text-green-700',
  football: 'bg-blue-100 text-blue-700',
  padel: 'bg-amber-100 text-amber-700',
  squash: 'bg-purple-100 text-purple-700',
};

export default function AcademyBrowsePage() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['academy', 'public', 'programs'],
    queryFn: () => publicAcademyApi.getPrograms(),
  });

  if (isLoading) return <div className="space-y-3"><SkeletonRow count={4} /></div>;
  if (isError || !data) {
    return <div className="text-sm text-[var(--color-text-muted)] py-8 text-center">{t('player.academy.empty')}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-[var(--color-text)]">{t('player.academy.browse_title')}</h1>
      </div>
      {data.length === 0 ? (
        <div className="text-sm text-[var(--color-text-muted)] py-8 text-center">{t('player.academy.empty')}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.map((p: PublicAcademyProgram) => (
            <Link
              key={p.id}
              to={`/academy/${p.id}`}
              className="block bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 hover:border-[var(--color-primary)]/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--color-text)] truncate">{p.name}</p>
                  {p.description && <p className="text-xs text-[var(--color-text-muted)] mt-0.5 line-clamp-2">{p.description}</p>}
                </div>
                {p.isFull && (
                  <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">{t('player.academy.full')}</span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className={`px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[p.category] || 'bg-gray-100 text-gray-700'}`}>{p.category}</span>
                {p.level && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{p.level}</span>}
                {p.season && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{p.season}</span>}
              </div>

              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="font-semibold text-[var(--color-text)]">
                  {p.price > 0 ? `${p.price} ${p.currency}` : t('player.academy.free')}
                </span>
                <span className="text-[var(--color-text-muted)]">
                  {p.isUnlimited
                    ? t('player.academy.unlimited')
                    : `${p.availableSeats} ${t('player.academy.seats_available')}`}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}