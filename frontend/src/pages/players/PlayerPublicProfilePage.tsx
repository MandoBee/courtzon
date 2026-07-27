import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../../i18n';
import { useToast } from '../../components/ui/Toast';
import { Can } from '../../permissions/Can';
import { getErrorMessage } from '../../utils/errors';
import { SkeletonRow } from '../../components/ui/Skeleton';
import api from '../../services/api';
import { EntityImage } from '../../components/ui/EntityImage';

function StatBox({ label, value }: { label: string; value: string | number | undefined | null }) {
  return (
    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3 text-center">
      <p className="text-lg font-bold text-[var(--color-text)]">{value ?? '—'}</p>
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
    </div>
  );
}

export default function PlayerPublicProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['players', id, 'profile'],
    queryFn: () => api.get(`/players/${id}/profile`).then((r) => r.data),
    enabled: !!id,
  });

  const { data: community } = useQuery({
    queryKey: ['players', id, 'community'],
    queryFn: () => api.get(`/community/followers?playerId=${id}`).then((r) => r.data?.data || r.data || {}),
    enabled: !!id,
  });

  const p = profile || {};
  const c = community || {};

  const isFollowing = c.isFollowing ?? c.amFollowing ?? false;
  const followersCount = c.followersCount ?? c.followers ?? c.total ?? 0;
  const followingCount = c.followingCount ?? c.following ?? 0;

  const followMutation = useMutation({
    mutationFn: () => api.post('/community/follow', { targetId: Number(id) }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players', id] });
      showToast(t('player.follow_success'));
    },
    onError: (err) => {
      showToast(getErrorMessage(err, t('player.follow_error')), 'error');
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: () => api.post('/community/unfollow', { targetId: Number(id) }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players', id] });
      showToast(t('player.unfollow_success'));
    },
    onError: (err) => {
      showToast(getErrorMessage(err, t('player.unfollow_error')), 'error');
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-[var(--color-border)] animate-pulse" />
          <div className="space-y-2 flex-1">
            <div className="h-5 w-40 bg-[var(--color-border)] rounded animate-pulse" />
            <div className="h-4 w-24 bg-[var(--color-border)] rounded animate-pulse" />
          </div>
        </div>
        <SkeletonRow count={3} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Profile Header */}
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border border-[var(--color-border)] p-5 md:p-6">
        <div className="flex items-center gap-4">
          <EntityImage src={p.avatar_url || p.avatarUrl} name={p.full_name || p.fullName} className="w-16 h-16 rounded-full text-2xl" />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-[var(--color-text)]">{p.full_name || p.fullName}</h1>
            <p className="text-sm text-[var(--color-text-muted)]">
              {t('player.member_since')} {p.created_at ? new Date(p.created_at).toLocaleDateString() : p.memberSince ? new Date(p.memberSince).toLocaleDateString() : '—'}
            </p>
            {(p.main_sport || p.mainSport) && (
              <span className="inline-block mt-1 text-xs bg-[var(--color-primary)]/10 text-[var(--color-primary)] px-2 py-0.5 rounded-full">
                {p.main_sport || p.mainSport}{p.main_level || p.mainLevel ? ` - ${p.main_level || p.mainLevel}` : ''}
              </span>
            )}
          </div>
          <Can permission="community.follow">
            <button
              onClick={() => isFollowing ? unfollowMutation.mutate() : followMutation.mutate()}
              disabled={followMutation.isPending || unfollowMutation.isPending}
              className={`px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] transition-colors disabled:opacity-50 ${
                isFollowing
                  ? 'bg-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)]'
                  : 'bg-[var(--color-primary)] text-white hover:opacity-90'
              }`}
            >
              {isFollowing ? t('player.unfollow') : t('player.follow')}
            </button>
          </Can>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
        <StatBox label={t('player.bookings')} value={p.totalBookings ?? p.total_bookings ?? 0} />
        <StatBox label={t('player.matches_played')} value={p.matchesPlayed ?? p.matches_played ?? 0} />
        <StatBox label={t('player.tournaments')} value={p.tournaments ?? p.tournaments_count ?? 0} />
        <StatBox label={t('player.followers')} value={followersCount} />
        <StatBox label={t('player.following')} value={followingCount} />
      </div>

      {/* Bio */}
      {(p.bio || p.biography) && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2">{t('common.bio')}</h3>
          <p className="text-sm text-[var(--color-text)]">{p.bio || p.biography}</p>
        </div>
      )}
    </div>
  );
}
