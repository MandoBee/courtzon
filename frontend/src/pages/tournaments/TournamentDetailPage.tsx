import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../services/api';
import { formatPrice } from '../../utils/currency';
import { Button, Card, Badge, Spinner } from '../../components/ui';

const statusVariant: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  draft: 'default', open: 'success', in_progress: 'info', completed: 'warning', cancelled: 'danger',
};

const matchStatusVariant: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  scheduled: 'default', in_progress: 'info', completed: 'success', cancelled: 'danger',
};

export default function TournamentDetailPage() {
  const { id } = useParams();

  const { data: t, isLoading, refetch } = useQuery({
    queryKey: ['tournament', id],
    queryFn: () => api.get(`/tournaments/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const bracketMutation = useMutation({
    mutationFn: () => api.post(`/tournaments/${id}/generate-bracket`),
    onSuccess: () => refetch(),
  });

  if (isLoading) return <Spinner className="py-12" />;
  if (!t) return <p className="text-center py-12 text-[var(--color-text-muted)]">Tournament not found</p>;

  return (
    <div>
      <Link to="/tournaments" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] mb-4 inline-block">
        &larr; Tournaments
      </Link>

      <Card className="mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text)]">{t.name}</h1>
            <p className="text-sm text-[var(--color-text-muted)]">
              {t.bracket_type_name}{t.organisation_name ? ` • ${t.organisation_name}` : ''}
            </p>
          </div>
          <Badge variant={statusVariant[t.status] || 'default'}>{t.status}</Badge>
        </div>
        {t.description && <p className="text-sm text-[var(--color-text)] mb-4">{t.description}</p>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
          <div><span className="text-[var(--color-text-muted)]">Entry Fee</span><p className="font-medium">{formatPrice(Number(t.entry_fee), t.currency_code)}</p></div>
          <div><span className="text-[var(--color-text-muted)]">Max Players</span><p className="font-medium">{t.max_participants}</p></div>
          <div><span className="text-[var(--color-text-muted)]">Start</span><p className="font-medium">{new Date(t.start_date).toLocaleDateString('en-GB')}</p></div>
          <div><span className="text-[var(--color-text-muted)]">Commission</span><p className="font-medium">{t.commission_rate}%</p></div>
        </div>
        {t.status === 'open' && (
          <Button onClick={() => bracketMutation.mutate()} loading={bracketMutation.isPending}>
            Generate Bracket &amp; Start
          </Button>
        )}
      </Card>

      {t.matches?.length > 0 && (
        <div className="mb-6">
          <h2 className="font-medium text-[var(--color-text)] mb-3">Matches</h2>
          <div className="space-y-2">
            {t.matches.map((m: any) => (
              <Card key={m.id} className="flex items-center justify-between">
                <div className="text-sm">
                  <span className="text-[var(--color-text-muted)]">R{m.round} M{m.match_number}: </span>
                  <span className="font-medium">{m.player1_name || 'TBD'}</span>
                  <span className="text-[var(--color-text-muted)]"> vs </span>
                  <span className="font-medium">{m.player2_name || 'TBD'}</span>
                </div>
                <div className="flex items-center gap-2">
                  {m.score_summary && <span className="text-sm font-mono">{m.score_summary}</span>}
                  <Badge variant={matchStatusVariant[m.status] || 'default'}>{m.status}</Badge>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="font-medium text-[var(--color-text)] mb-3">
          Players ({t.registrations?.length || 0}/{t.max_participants})
        </h2>
        <div className="flex flex-wrap gap-2">
          {t.registrations?.map((r: any) => (
            <span key={r.id} className="px-3 py-1 bg-[var(--color-surface)] rounded-full text-sm">{r.player_name}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
