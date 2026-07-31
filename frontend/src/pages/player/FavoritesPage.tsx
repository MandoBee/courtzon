import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../../i18n';
import { useToast } from '../../components/ui/Toast';
import { Can } from '../../permissions/Can';
import { getErrorMessage } from '../../utils/errors';
import { SkeletonRow } from '../../components/ui/Skeleton';
import api from '../../services/api';
import { EntityImage } from '../../components/ui/EntityImage';

export default function FavoritesPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'clubs' | 'coaches'>('clubs');

  const { data: clubs, isLoading: loadingClubs } = useQuery({
    queryKey: ['my', 'favorites', 'clubs'],
    queryFn: () => api.get('/players/my/favorites/clubs').then((r) => r.data?.data || r.data || []),
  });

  const { data: coaches, isLoading: loadingCoaches } = useQuery({
    queryKey: ['my', 'favorites', 'coaches'],
    queryFn: () => api.get('/players/my/favorites/coaches').then((r) => r.data?.data || r.data || []),
  });

  const unfavoriteMutation = useMutation({
    mutationFn: ({ type, id }: { type: 'clubs' | 'coaches'; id: number }) =>
      api.delete(`/players/my/favorites/${type}/${id}`).then((r) => r.data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['my', 'favorites', variables.type] });
      showToast(t('player.unfavorite_success'));
    },
    onError: (err) => {
      showToast(getErrorMessage(err, t('player.unfavorite_error')), 'error');
    },
  });

  const clubsList: any[] = Array.isArray(clubs) ? clubs : [];
  const coachesList: any[] = Array.isArray(coaches) ? coaches : [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-[var(--color-text)]">{t('player.my_favorites')}</h1>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--color-border)]">
        <button
          onClick={() => setTab('clubs')}
          className={`px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors ${
            tab === 'clubs' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
          }`}
        >
          {t('player.clubs')}
        </button>
        <button
          onClick={() => setTab('coaches')}
          className={`px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors ${
            tab === 'coaches' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
          }`}
        >
          {t('player.coaches')}
        </button>
      </div>

      {/* Clubs Tab */}
      {tab === 'clubs' && (
        <>
          {loadingClubs ? <SkeletonRow count={3} /> : (
            <div className="space-y-2">
              {clubsList.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)] py-8 text-center">{t('player.no_favorite_clubs')}</p>
              ) : clubsList.map((club: any) => (
                <div key={club.id} className="flex items-center gap-3 bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3">
                  <EntityImage src={club.image_url || club.logo_url || club.imageUrl} name={club.name || club.organisation_name} className="w-12 h-12 rounded-[var(--radius-md)]" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--color-text)] truncate">{club.name || club.organisation_name}</p>
                  </div>
                  <Can permission="player.favorites.manage">
                    <button
                      onClick={() => unfavoriteMutation.mutate({ type: 'clubs', id: club.id })}
                      disabled={unfavoriteMutation.isPending}
                      className="px-3 py-1.5 text-xs font-medium border border-[var(--color-border)] text-[var(--color-text-muted)] rounded-[var(--radius-md)] hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)] hover:border-[var(--color-error)]/30 transition-colors disabled:opacity-50"
                    >
                      {t('player.unfavorite')}
                    </button>
                  </Can>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Coaches Tab */}
      {tab === 'coaches' && (
        <>
          {loadingCoaches ? <SkeletonRow count={3} /> : (
            <div className="space-y-2">
              {coachesList.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)] py-8 text-center">{t('player.no_favorite_coaches')}</p>
              ) : coachesList.map((coach: any) => (
                <div key={coach.id} className="flex items-center gap-3 bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3">
                  <EntityImage src={coach.avatar_url || coach.avatarUrl} name={coach.full_name || coach.name || coach.fullName} className="w-12 h-12 rounded-full" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--color-text)] truncate">{coach.full_name || coach.name || coach.fullName}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{coach.main_sport || coach.sport || ''}</p>
                  </div>
                  <Can permission="player.favorites.manage">
                    <button
                      onClick={() => unfavoriteMutation.mutate({ type: 'coaches', id: coach.id })}
                      disabled={unfavoriteMutation.isPending}
                      className="px-3 py-1.5 text-xs font-medium border border-[var(--color-border)] text-[var(--color-text-muted)] rounded-[var(--radius-md)] hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)] hover:border-[var(--color-error)]/30 transition-colors disabled:opacity-50"
                    >
                      {t('player.unfavorite')}
                    </button>
                  </Can>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
