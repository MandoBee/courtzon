import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '../../i18n';
import api from '../../services/api';

export default function AchievementsPage() {
  const { t } = useTranslation();

  const { data: achievements, isLoading } = useQuery({
    queryKey: ['my', 'achievements'],
    queryFn: () => api.get('/my/achievements').then((r) => r.data?.data || r.data || []),
  });

  const list: any[] = Array.isArray(achievements) ? achievements : [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-48 bg-[var(--color-border)] rounded animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 bg-[var(--color-border)] rounded-[var(--radius-lg)] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-[var(--color-text)]">{t('player.achievements')}</h1>

      {list.length === 0 ? (
        <div className="text-center py-12 text-sm text-[var(--color-text-muted)]">
          {t('player.no_achievements')}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {list.map((a: any, i: number) => {
            const unlocked = !!a.unlocked_at || !!a.unlockedAt || a.isUnlocked === true || a.is_unlocked === true;
            return (
              <div
                key={a.id ?? i}
                className={`rounded-[var(--radius-lg)] border p-4 flex flex-col items-center text-center gap-2 transition-opacity ${
                  unlocked
                    ? 'bg-[var(--color-surface)] border-[var(--color-border)]'
                    : 'bg-[var(--color-surface)]/50 border-[var(--color-border)] opacity-60'
                }`}
              >
                <span className={`text-3xl ${unlocked ? '' : 'grayscale'}`}>{a.icon || a.badge_icon || '🏅'}</span>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold truncate ${unlocked ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'}`}>
                    {a.title || a.name || a.badge_name}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)] line-clamp-2">{a.description || a.badge_description}</p>
                </div>
                {unlocked && (a.unlocked_at || a.unlockedAt) ? (
                  <p className="text-[10px] text-[var(--color-text-muted)]">
                    {t('player.unlocked')} {new Date(a.unlocked_at || a.unlockedAt).toLocaleDateString()}
                  </p>
                ) : (
                  <div className="w-full mt-1">
                    <div className="h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--color-text-muted)] rounded-full"
                        style={{ width: `${Math.min(a.progress ?? a.progress_pct ?? 0, 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                      {a.progress ?? a.progress_pct ?? 0}%
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
