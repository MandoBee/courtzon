import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '../../i18n';
import api from '../../services/api';
import { Can } from '../../permissions/Can';
import { Card } from '../../components/ui';

export default function RankHistoryPage() {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ['my-rank-history'],
    queryFn: () => api.get('/my/rank-history').then((r) => r.data),
  });

  return (
    <Can permission="player.rank.history">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-xl font-bold text-[var(--color-text)]">{t('player.rank.title') || 'Rank History'}</h1>

        {isLoading ? (
          <p className="text-sm text-[var(--color-text-muted)]">{t('common.loading')}</p>
        ) : (
          <>
            {data?.tournament_standings?.length > 0 && (
              <Card>
                <h2 className="font-semibold text-[var(--color-text)] mb-4">{t('player.rank.tournaments') || 'Tournament Rankings'}</h2>
                <div className="space-y-3">
                  {data.tournament_standings.map((s: any) => (
                    <div key={s.id} className="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0">
                      <div>
                        <p className="text-sm font-medium text-[var(--color-text)]">{s.tournament_name}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {s.start_date ? new Date(s.start_date).toLocaleDateString('en-GB') : ''}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-[var(--color-primary)]">
                        #{s.rank_position}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {data?.league_standings?.length > 0 && (
              <Card>
                <h2 className="font-semibold text-[var(--color-text)] mb-4">{t('player.rank.leagues') || 'League Rankings'}</h2>
                <div className="space-y-3">
                  {data.league_standings.map((s: any) => (
                    <div key={s.id} className="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0">
                      <div>
                        <p className="text-sm font-medium text-[var(--color-text)]">{s.league_name} - {s.division_name}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">{s.league_code}</p>
                      </div>
                      <span className="text-sm font-bold text-[var(--color-primary)]">
                        #{s.position}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {(!data?.tournament_standings?.length && !data?.league_standings?.length) && (
              <Card>
                <p className="text-sm text-[var(--color-text-muted)]">{t('player.rank.no_history') || 'No rank history found.'}</p>
              </Card>
            )}
          </>
        )}
      </div>
    </Can>
  );
}
