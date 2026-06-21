import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { formatPrice } from '../../utils/currency';
import { Button, Card, Badge, Spinner } from '../../components/ui';

const statusVariant: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  draft: 'default', open: 'success', in_progress: 'info', completed: 'warning', cancelled: 'danger',
};

export default function TournamentListPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['tournaments'],
    queryFn: () => api.get('/tournaments?limit=50').then((r) => r.data),
  });

  const tournaments = data?.data || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Tournaments</h1>
        <Link to="/tournaments/new"><Button>+ Create Tournament</Button></Link>
      </div>
      {isLoading ? (
        <Spinner />
      ) : tournaments.length === 0 ? (
        <p className="text-center py-12 text-sm text-[var(--color-text-muted)]">No tournaments yet</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tournaments.map((t: any) => (
            <Link key={t.id} to={`/tournaments/${t.id}`} className="block">
              <Card className="hover:shadow-[var(--shadow-lg)] transition-shadow cursor-pointer">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-medium text-[var(--color-text)]">{t.name}</h3>
                  <Badge variant={statusVariant[t.status] || 'default'}>{t.status}</Badge>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mb-3">
                  {t.bracket_type_name}{t.sport_name ? ` • ${t.sport_name}` : ''}
                </p>
                <div className="flex gap-3 text-xs text-[var(--color-text-muted)]">
                  <span>Max: {t.max_participants}</span>
                  <span>Fee: {formatPrice(Number(t.entry_fee), t.currency_code)}</span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  Start: {new Date(t.start_date).toLocaleDateString('en-GB')}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
