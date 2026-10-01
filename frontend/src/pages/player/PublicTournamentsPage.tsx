import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { publicTournamentApi } from '../../services/tournament';
import { Card, Spinner } from '../../components/ui';

/**
 * G11.16 — Public / anonymous tournament discovery LIST.
 * No authentication required. Backend returns ONLY is_public=1 tournaments.
 */
export default function PublicTournamentsPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['public-tournaments'],
    queryFn: () => publicTournamentApi.list(),
  });

  const title = 'Public Tournaments';
  const sub = 'Browsing is open to everyone. Login to register, join, or manage tournaments.';

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{title}</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">{sub}</p>
      </header>

      {isLoading ? (
        <div className="py-10 flex justify-center"><Spinner /></div>
      ) : isError ? (
        <Card>
          <p className="text-sm text-[var(--color-text-muted)]">
            Failed to load public tournaments. Please try again later.
            {error ? ` (${(error as any)?.message ?? ''})` : ''}
          </p>
        </Card>
      ) : !data || data.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--color-text-muted)]">No public tournaments right now.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.map((t: any) => (
            <Card key={t.id}>
              <Link to={`/tournaments/public/${t.id}`} className="block">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-[var(--color-text)]">{t.name}</h3>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {t.format && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-primary-bg)] text-[var(--color-primary)]">
                          {t.format}
                        </span>
                      )}
                      {t.status && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-bg)] text-[var(--color-text-muted)]">
                          {t.status}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)] mt-2">
                      {[t.sport_name, t.bracket_type_name, t.organisation_name].filter(Boolean).join(' · ') || '—'}
                    </p>
                    {t.start_date && (
                      <p className="text-xs text-[var(--color-text-muted)]">
                        Starts {new Date(t.start_date).toLocaleDateString('en-GB')}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-[var(--color-text-muted)]">
        <Link to="/login" className="text-[var(--color-primary)] hover:underline">Sign in</Link>
        {' '}to see your tournaments, register, or self-cancel.
      </p>
    </div>
  );
}