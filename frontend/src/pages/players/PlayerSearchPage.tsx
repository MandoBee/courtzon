import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import { useToast } from '../../components/ui/Toast';
import { Can } from '../../permissions/Can';
import { getErrorMessage } from '../../utils/errors';
import { SkeletonRow } from '../../components/ui/Skeleton';
import api from '../../services/api';
import { EntityImage } from '../../components/ui/EntityImage';

export default function PlayerSearchPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isLoading } = useQuery({
    queryKey: ['players', 'search', debounced],
    queryFn: () => api.get(`/players/search?q=${encodeURIComponent(debounced)}&limit=20`).then((r) => r.data?.data || r.data || []),
    enabled: debounced.length >= 2,
  });

  const results: any[] = Array.isArray(data) ? data : [];

  const followMutation = useMutation({
    mutationFn: (playerId: number) => api.post('/community/follow', { targetId: playerId }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players', 'search'] });
      showToast(t('player.follow_success'));
    },
    onError: (err) => {
      showToast(getErrorMessage(err, t('player.follow_error')), 'error');
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-[var(--color-text)]">{t('player.search_players')}</h1>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('player.search_placeholder')}
        className="w-full px-4 py-2.5 text-sm rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
      />

      {isLoading && <SkeletonRow count={4} />}

      {!isLoading && debounced.length >= 2 && results.length === 0 && (
        <div className="text-center py-12 text-sm text-[var(--color-text-muted)]">
          {t('player.no_results_found')}
        </div>
      )}

      {!isLoading && debounced.length < 2 && (
        <div className="text-center py-12 text-sm text-[var(--color-text-muted)]">
          {t('player.type_to_search')}
        </div>
      )}

      <div className="space-y-2">
        {results.map((player: any) => (
          <div
            key={player.id}
            className="flex items-center gap-3 bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3 hover:border-[var(--color-primary)]/30 transition-colors"
          >
            <Link to={`/players/${player.id}`} className="flex items-center gap-3 flex-1 min-w-0">
              <EntityImage src={player.avatar_url || player.avatarUrl} name={player.full_name || player.fullName} className="w-10 h-10 rounded-full" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--color-text)] truncate">{player.full_name || player.fullName}</p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {player.main_sport || player.mainSport || ''}{player.main_sport && player.main_level ? ` · ${player.main_level}` : player.main_level || ''}
                </p>
              </div>
            </Link>
            <Can permission="community.follow">
              <button
                onClick={(e) => { e.preventDefault(); followMutation.mutate(player.id); }}
                disabled={followMutation.isPending}
                className="px-3 py-1.5 text-xs font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50 shrink-0"
              >
                {t('player.follow')}
              </button>
            </Can>
          </div>
        ))}
      </div>
    </div>
  );
}
