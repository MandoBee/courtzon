import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../../i18n';
import api from '../../services/api';
import { playerCancelRegistration } from '../../services/tournament';
import { Can } from '../../permissions/Can';
import { Button, Card } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { Link } from 'react-router-dom';

export default function TournamentsPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['my-tournaments'],
    queryFn: () => api.get('/my/tournaments').then((r) => r.data),
  });

  const [pendingId, setPendingId] = useState<number | null>(null);

  const cancelMutation = useMutation({
    mutationFn: (registrationId: number) =>
      playerCancelRegistration(registrationId).then((r) => r.data),
    onMutate: (registrationId: number) => setPendingId(registrationId),
    onSuccess: () => {
      setPendingId(null);
      queryClient.invalidateQueries({ queryKey: ['my-tournaments'] });
      showToast(t('player.tournaments.cancel_refunded') || 'Registration cancelled and your entry fee was fully refunded.');
    },
    onError: (err: any) => {
      setPendingId(null);
      const status = err?.response?.status;
      const message = err?.response?.data?.message;
      if (status === 401) {
        showToast(t('player.tournaments.cancel_unauthorized') || 'Please sign in to cancel your registration.', 'error');
      } else if (status === 404) {
        showToast(t('player.tournaments.cancel_not_found') || 'Registration not found, or you can only cancel your own registration.', 'error');
      } else if (status === 409) {
        showToast(message || t('player.tournaments.cancel_draw_locked') || 'Cancellation is closed because the tournament draw is locked.', 'error');
      } else if (status === 422) {
        showToast(message || t('player.tournaments.cancel_not_allowed') || 'This registration cannot be cancelled.', 'error');
      } else {
        showToast(message || t('player.tournaments.cancel_failed') || 'Failed to cancel registration.', 'error');
      }
    },
  });

  const onCancel = (reg: any) => {
    const ok = window.confirm(
      t('player.tournaments.cancel_confirm') ||
        'Cancel your registration? Your entry fee will be 100% refunded (allowed before the tournament draw is locked).',
    );
    if (ok) cancelMutation.mutate(reg.id);
  };

  return (
    <Can permission="player.tournaments.register">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-xl font-bold text-[var(--color-text)]">{t('player.tournaments.title') || 'My Tournaments'}</h1>

        {isLoading ? (
          <p className="text-sm text-[var(--color-text-muted)]">{t('common.loading')}</p>
        ) : isError ? (
          <Card>
            <p className="text-sm text-[var(--color-error)]">{t('player.tournaments.load_error', 'Unable to load your tournaments.')}</p>
            <Button onClick={() => refetch()} className="mt-4">
              {t('common.retry', 'Retry')}
            </Button>
          </Card>
        ) : !data?.length ? (
          <Card>
            <p className="text-sm text-[var(--color-text-muted)]">{t('player.tournaments.no_tournaments') || 'No tournament registrations found.'}</p>
            <Link to="/tournaments" className="inline-block mt-4 text-sm text-[var(--color-primary)] hover:underline">
              {t('player.tournaments.browse') || 'Browse Tournaments'}
            </Link>
          </Card>
        ) : (
          <div className="space-y-3">
            {data.map((reg: any) => {
              const drawLocked = !!reg.drawLocked;
              const canCancel = reg.tournament_status !== 'completed' && reg.tournament_status !== 'cancelled' && !drawLocked;
              const isPending = pendingId === reg.id;
              return (
                <Card key={reg.id}>
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-[var(--color-text)]">{reg.tournament_name}</h3>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-primary-bg)] text-[var(--color-primary)]">
                          {reg.tournament_status}
                        </span>
                        {drawLocked && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                            {t('player.tournaments.draw_locked') || 'Draw locked'}
                          </span>
                        )}
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-bg)] text-[var(--color-text-muted)]">
                          {reg.format}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)] mt-2">
                        {new Date(reg.registered_at).toLocaleDateString('en-GB')}
                      </p>
                      {reg.start_date && (
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {t('player.tournaments.starts') || 'Starts'}: {new Date(reg.start_date).toLocaleDateString('en-GB')}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 ml-4">
                      {canCancel && (
                        <Can permission="tournaments.registration.cancel">
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={isPending}
                            disabled={isPending}
                            onClick={() => onCancel(reg)}
                          >
                            {t('common.cancel')}
                          </Button>
                        </Can>
                      )}
                      <Link
                        to={`/tournaments/${reg.tournament_id}`}
                        className="text-xs text-[var(--color-primary)] hover:underline text-center"
                      >
                        {t('common.view') || 'View'}
                      </Link>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Can>
  );
}