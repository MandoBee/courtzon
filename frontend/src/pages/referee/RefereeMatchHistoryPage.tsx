import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '../../i18n';
import api from '../../services/api';
import { formatISODate } from '../../utils/formatDate';
import { SkeletonRow } from '../../components/ui';
import { Can } from '../../permissions/Can';

export default function RefereeMatchHistoryPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data: matches, isLoading } = useQuery({
    queryKey: ['referee-matches'],
    queryFn: () => api.get('/referee/matches').then((r) => r.data),
  });

  const list = Array.isArray(matches?.data) ? matches.data : Array.isArray(matches) ? matches : [];

  const filtered = list.filter((m: any) => {
    const matchSearch = !search || (m.competitionName || m.competition_name || '').toLowerCase().includes(search.toLowerCase());
    const matchFrom = !dateFrom || new Date(m.date || m.scheduled_at) >= new Date(dateFrom);
    const matchTo = !dateTo || new Date(m.date || m.scheduled_at) <= new Date(dateTo + 'T23:59:59');
    return matchSearch && matchFrom && matchTo;
  });

  return (
    <div className="space-y-5 md:space-y-6 pb-4">
      <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text)]">
        {t('referee.matches.title', 'Match History')}
      </h1>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('referee.matches.search', 'Search competition...')}
          className="flex-1 px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-[var(--color-text)]"
        />
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-[var(--color-text)]"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="px-3 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-[var(--color-text)]"
        />
      </div>

      {isLoading && <SkeletonRow count={5} />}

      {!isLoading && filtered.length === 0 && (
        <p className="text-sm text-[var(--color-text-muted)] py-8 text-center">
          {t('referee.matches.empty', 'No matches found')}
        </p>
      )}

      <Can permission="referee.statistics.view">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="text-left p-2 font-medium text-[var(--color-text-muted)]">{t('referee.matches.type', 'Type')}</th>
                <th className="text-left p-2 font-medium text-[var(--color-text-muted)]">{t('referee.matches.competition', 'Competition')}</th>
                <th className="text-left p-2 font-medium text-[var(--color-text-muted)]">{t('referee.matches.date', 'Date')}</th>
                <th className="text-left p-2 font-medium text-[var(--color-text-muted)]">{t('referee.matches.home', 'Home')}</th>
                <th className="text-left p-2 font-medium text-[var(--color-text-muted)]">{t('referee.matches.away', 'Away')}</th>
                <th className="text-left p-2 font-medium text-[var(--color-text-muted)]">{t('referee.matches.score', 'Score')}</th>
                <th className="text-left p-2 font-medium text-[var(--color-text-muted)]">{t('referee.matches.outcome', 'Outcome')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m: any) => (
                <tr key={m.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]/50">
                  <td className="p-2 text-[var(--color-text)] capitalize">{m.matchType || m.match_type || '—'}</td>
                  <td className="p-2 text-[var(--color-text)]">{m.competitionName || m.competition_name || '—'}</td>
                  <td className="p-2 text-[var(--color-text)]">{formatISODate(m.date || m.scheduled_at)}</td>
                  <td className="p-2 text-[var(--color-text)]">{m.homeTeam || m.home_team || '—'}</td>
                  <td className="p-2 text-[var(--color-text)]">{m.awayTeam || m.away_team || '—'}</td>
                  <td className="p-2 text-[var(--color-text)]">{m.score || m.final_score || '—'}</td>
                  <td className="p-2 text-[var(--color-text)] capitalize">{m.outcome || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Can>
    </div>
  );
}
