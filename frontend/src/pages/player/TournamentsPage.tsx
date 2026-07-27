import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../../i18n';
import api from '../../services/api';
import { Can } from '../../permissions/Can';
import { Button, Card } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { Link } from 'react-router-dom';

export default function TournamentsPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['my-tournaments'],
    queryFn: () => api.get('/my/tournaments').then((r) => r.data),
  });

  const cancelMutation = useMutation({
    mutationFn: (registrationId: number) =>
      api.delete(`/tournaments/registration/${registrationId}`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-tournaments'] });
      showToast(t('player.tournaments.cancelled') || 'Registration cancelled');
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message || 'Failed to cancel registration', 'error');
    },
  });

  return (
    <Can permission="player.tournaments.register">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-xl font-bold text-[var(--color-text)]">{t('player.tournaments.title') || 'My Tournaments'}</h1>

        {isLoading ? (
          <p className="text-sm text-[var(--color-text-muted)]">{t('common.loading')}</p>
        ) : !data?.length ? (
          <Card>
            <p className="text-sm text-[var(--color-text-muted)]">{t('player.tournaments.no_tournaments') || 'No tournament registrations found.'}</p>
            <Link to="/tournaments" className="inline-block mt-4 text-sm text-[var(--color-primary)] hover:underline">
              {t('player.tournaments.browse') || 'Browse Tournaments'}
            </Link>
          </Card>
        ) : (
          <div className="space-y-3">
            {data.map((reg: any) => (
              <Card key={reg.id}>
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-[var(--color-text)]">{reg.tournament_name}</h3>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-primary-bg)] text-[var(--color-primary)]">
                        {reg.tournament_status}
                      </span>
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
                    {reg.tournament_status !== 'completed' && reg.tournament_status !== 'cancelled' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={cancelMutation.isPending}
                        onClick={() => cancelMutation.mutate(reg.id)}
                      >
                        {t('common.cancel')}
                      </Button>
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
            ))}
          </div>
        )}
      </div>
    </Can>
  );
}
