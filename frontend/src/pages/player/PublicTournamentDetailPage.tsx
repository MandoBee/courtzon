import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { publicTournamentApi } from '../../services/tournament';
import { Card, Spinner } from '../../components/ui';
import { TournamentBracket } from '../../components/tournaments/TournamentBracket';

/**
 * G11.16 — Public / anonymous tournament DETAIL.
 * No authentication required. Safe public fields only (no prizes, fees,
 * payment methods, private participants/members, or tenant internals).
 */
export default function PublicTournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const tid = Number(id);

  const { data: t, isLoading, isError } = useQuery({
    queryKey: ['public-tournament', tid],
    queryFn: () => publicTournamentApi.get(tid),
    enabled: Number.isFinite(tid),
  });

  if (isLoading || !Number.isFinite(tid)) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 flex justify-center"><Spinner /></div>
    );
  }
  if (isError || !t) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Card>
          <p className="text-sm text-[var(--color-text-muted)]">
            This tournament is unavailable or not public.
          </p>
          <Link to="/tournaments/public" className="inline-block mt-3 text-sm text-[var(--color-primary)] hover:underline">
            ← Back to public tournaments
          </Link>
        </Card>
      </div>
    );
  }

  const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString('en-GB') : '—');

  // Step 4C — GSK detection. The public read-model exposes the full match list
  // and standings but does NOT (yet) expose group_id/stage_id, groups or stages,
  // so the grouped-standings + knockout-only views cannot be separated publicly.
  // We therefore present the authoritative match list neutrally (never claim it
  // is a knockout bracket) and keep the public standings table. No fabrication.
  const isGsk = t.format === 'group_stage_knockout';

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div>
        <Link to="/tournaments/public" className="text-sm text-[var(--color-primary)] hover:underline">
          ← Back to public tournaments
        </Link>
        <h1 className="text-2xl font-bold text-[var(--color-text)] mt-2">{t.name}</h1>
        <div className="flex flex-wrap gap-2 mt-2">
          {t.format && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-primary-bg)] text-[var(--color-primary)]">{t.format}</span>
          )}
          {t.status && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-bg)] text-[var(--color-text-muted)]">{t.status}</span>
          )}
          {t.bracket_type && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-bg)] text-[var(--color-text-muted)]">{t.bracket_type}</span>
          )}
        </div>
      </div>

      {t.description && (
        <Card>
          <p className="text-sm text-[var(--color-text)] whitespace-pre-line">{t.description}</p>
        </Card>
      )}

      <Card>
        <h2 className="font-semibold text-[var(--color-text)] mb-3">Details</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div><dt className="text-[var(--color-text-muted)]">Sport</dt><dd className="text-[var(--color-text)]">{t.sport?.name ?? '—'}</dd></div>
          <div><dt className="text-[var(--color-text-muted)]">Organiser</dt><dd className="text-[var(--color-text)]">{t.organisation ?? '—'}</dd></div>
          <div><dt className="text-[var(--color-text-muted)]">Start</dt><dd className="text-[var(--color-text)]">{fmtDate(t.start_date)}</dd></div>
          <div><dt className="text-[var(--color-text-muted)]">End</dt><dd className="text-[var(--color-text)]">{fmtDate(t.end_date)}</dd></div>
          <div><dt className="text-[var(--color-text-muted)]">Registration window</dt>
            <dd className="text-[var(--color-text)]">{fmtDate(t.registration_opens)} → {fmtDate(t.registration_closes)}</dd></div>
          <div><dt className="text-[var(--color-text-muted)]">Capacity</dt>
            <dd className="text-[var(--color-text)]">{t.max_participants ?? '—'} {t.max_teams ? `(max ${t.max_teams} teams)` : ''}</dd></div>
        </dl>
      </Card>

      {t.venue && (
        <Card>
          <h2 className="font-semibold text-[var(--color-text)] mb-2">Venue</h2>
          <p className="text-sm text-[var(--color-text)]">
            {[t.venue.name, t.venue.address_line1, t.venue.city].filter(Boolean).join(', ') || '—'}
          </p>
        </Card>
      )}

      {/* Replaces the former hand-rolled <ul> list with the ONE shared
          TournamentBracket, so anonymous visitors get the same sport-aware visual
          bracket. The public read-model exposes participant names only, which
          TournamentBracket/MatchCard already fall back to. No auth, no drawer. */}
      {Array.isArray(t.bracket) && t.bracket.length > 0 && (
        <Card>
          <h2 className="font-semibold text-[var(--color-text)] mb-3" data-testid="public-bracket-heading">{isGsk ? 'Matches' : 'Bracket'}</h2>
          {isGsk && (
            <p className="text-xs text-[var(--color-text-muted)] mb-3">Includes group-stage and knockout matches.</p>
          )}
          <div data-testid="public-bracket">
          <TournamentBracket
            tournament={{ id: t.id, name: t.name, format: t.format, bracket_type_name: t.bracket_type, status: t.status, sport_name: t.sport?.name }}
            matches={(t.bracket as any[]).map((m, i) => ({
              id: i + 1,
              round: m.round,
              round_name: m.round_name,
              match_number: m.match_number,
              bracket_position: m.bracket_position,
              participant1_name: m.participant1_name,
              participant2_name: m.participant2_name,
              status: m.status,
              score_summary: m.score_summary,
              start_time: m.start_time,
              progression_state: m.progression_state,
            }))}
          />
          </div>
        </Card>
      )}

      {Array.isArray(t.standings) && t.standings.length > 0 && (
        <Card>
          <h2 className="font-semibold text-[var(--color-text)] mb-3" data-testid="public-standings-heading">Standings</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left">
                <th className="px-2 py-2">#</th>
                <th className="px-2 py-2">Player</th>
                <th className="px-2 py-2">Points</th>
                <th className="px-2 py-2">W / L / D</th>
              </tr>
            </thead>
            <tbody>
              {t.standings.map((s: any) => (
                <tr key={s.rank_position} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-2 py-1.5">{s.rank_position ?? '—'}</td>
                  <td className="px-2 py-1.5">{s.player_name ?? '—'}</td>
                  <td className="px-2 py-1.5">{s.points ?? 0}</td>
                  <td className="px-2 py-1.5">{s.wins ?? 0} / {s.losses ?? 0} / {s.draws ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <p className="text-xs text-[var(--color-text-muted)]">
        Want to join?{' '}
        <Link to="/login" className="text-[var(--color-primary)] hover:underline">Sign in</Link>
        {' '}to register for this tournament.
      </p>
    </div>
  );
}