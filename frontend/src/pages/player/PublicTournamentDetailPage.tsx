import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { publicTournamentApi } from '../../services/tournament';
import { Card, Spinner, Button } from '../../components/ui';
import { useTranslation } from '../../i18n';
import { TournamentBracket } from '../../components/tournaments/TournamentBracket';
import { MatchCard } from '../../components/tournaments/MatchCard';
import { MatchDetailsDrawer } from '../../components/tournaments/MatchDetailsDrawer';
import { GskGroupsView, GskQualificationPanel, GskKnockoutPanel } from '../../components/tournaments/hub/GskCompetitionViews';
import type { TournamentMatchNode } from '../../types/tournamentBracket';

/**
 * G11.16 — Public / anonymous tournament DETAIL.
 * No authentication required. Safe public fields only (no prizes, fees,
 * payment methods, private participants/members, or tenant internals).
 *
 * Step 4E — for `group_stage_knockout` tournaments the page adds a read-only
 * GSK experience (Groups → Group Standings → Qualification → Knockout) driven
 * ENTIRELY by the public read-model's explicit `groups[]`, `stages[]`,
 * `standings[].group_id` and `bracket[].stage_id|group_id`. No inference from
 * match order/naming, no organizer actions, no private data. Non-GSK formats
 * keep their exact previous layout.
 */

type GskTab = 'overview' | 'matches' | 'groups' | 'qualification' | 'knockout' | 'standings';

export default function PublicTournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const tid = Number(id);
  // i18n aliased to `translate` because `t` is the local tournament data variable.
  const { t: translate } = useTranslation();
  const [tab, setTab] = useState<GskTab>('overview');
  const [groupFilter, setGroupFilter] = useState<number | null>(null);
  const [drawerMatch, setDrawerMatch] = useState<TournamentMatchNode | null>(null);

  const { data: t, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['public-tournament', tid],
    queryFn: () => publicTournamentApi.get(tid),
    enabled: Number.isFinite(tid),
  });

  if (isLoading || !Number.isFinite(tid)) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 flex justify-center"><Spinner /></div>
    );
  }
  // F-02 — distinguish a genuine "not found / not public" (HTTP 404) from a
  // transient network/server failure. The backend returns 404
  // TOURNAMENT_NOT_FOUND for missing, private, draft, cancelled or archived
  // tournaments; any other failure (transport, 5xx, no status) is recoverable
  // and offers Retry instead of a misleading not-found state.
  const errorStatus = (error as unknown as { response?: { status?: number } } | undefined)?.response?.status;
  if (isError && errorStatus !== 404) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Card>
          <p className="text-sm text-[var(--color-error)]">Unable to load this tournament. Please try again.</p>
          <Button onClick={() => refetch()} className="mt-4">
            {translate('common.retry', 'Retry')}
          </Button>
        </Card>
      </div>
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

  // Step 4C/4E — GSK detection (public, explicit contract only).
  const isGsk = t.format === 'group_stage_knockout';

  // Step 4D read-model fields (all optional / additive).
  const groups: any[] = Array.isArray(t.groups) ? t.groups : [];
  const stages: any[] = Array.isArray(t.stages) ? t.stages : [];
  const standings: any[] = Array.isArray(t.standings) ? t.standings : [];
  const bracketRows: any[] = Array.isArray(t.bracket) ? t.bracket : [];

  // Normalise the public bracket rows into the shared match-node shape. `id` is a
  // stable synthetic index (the public contract never exposes internal ids).
  const allMatches: TournamentMatchNode[] = bracketRows.map((m, i) => ({
    id: i + 1,
    round: m.round,
    round_name: m.round_name,
    match_number: m.match_number,
    bracket_position: m.bracket_position,
    stage_id: m.stage_id ?? null,
    group_id: m.group_id ?? null,
    participant1_name: m.participant1_name,
    participant2_name: m.participant2_name,
    status: m.status,
    score_summary: m.score_summary,
    start_time: m.start_time,
    progression_state: m.progression_state,
  }) as TournamentMatchNode);

  // Explicit stage identification (never array position / match order).
  const groupStage = stages.find((s) => s.progression_format === 'round_robin') ?? null;
  const knockoutStage = stages.find((s) => s.progression_format === 'knockout') ?? null;
  const qualifyTop = Number(groupStage?.config?.groupStage?.qualification?.topPerGroup ?? 0) || undefined;
  const groupMatches = allMatches.filter((m) => m.group_id != null);
  const filteredMatches = groupFilter == null
    ? allMatches
    : allMatches.filter((m) => Number(m.group_id) === groupFilter);

  const GSK_TABS: GskTab[] = ['overview', 'matches', 'groups', 'qualification', 'knockout', 'standings'];
  const tabLabel = (tb: GskTab): string => {
    switch (tb) {
      case 'overview': return 'Overview';
      case 'matches': return 'Matches';
      case 'groups': return 'Groups';
      case 'qualification': return 'Qualification';
      case 'knockout': return 'Knockout';
      default: return 'Standings';
    }
  };

  // Shared Overview content — identical for GSK (Overview tab) and non-GSK.
  const overviewBlocks = (
    <>
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
    </>
  );

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

      {isGsk ? (
        <>
          <div role="tablist" aria-label="Tournament sections" className="flex gap-1 flex-wrap">
            {GSK_TABS.map((tb) => (
              <button
                key={tb}
                type="button"
                role="tab"
                aria-selected={tab === tb}
                onClick={() => setTab(tb)}
                className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-full ${tab === tb ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-bg)] text-[var(--color-text-muted)]'}`}
              >
                {tabLabel(tb)}
              </button>
            ))}
          </div>

          {tab === 'overview' && <div className="space-y-6" data-testid="public-gsk-overview">{overviewBlocks}</div>}

          {tab === 'matches' && (
            <Card>
              <h2 className="font-semibold text-[var(--color-text)] mb-3">Matches</h2>
              {groups.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3" data-testid="public-gsk-group-filter">
                  <button
                    type="button"
                    onClick={() => setGroupFilter(null)}
                    aria-pressed={groupFilter == null}
                    className={`min-h-[32px] px-2.5 py-1 text-[11px] rounded-full ${groupFilter == null ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-bg)] text-[var(--color-text-muted)]'}`}
                  >
                    All
                  </button>
                  {groups.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGroupFilter(Number(g.id))}
                      aria-pressed={groupFilter === Number(g.id)}
                      className={`min-h-[32px] px-2.5 py-1 text-[11px] rounded-full ${groupFilter === Number(g.id) ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-bg)] text-[var(--color-text-muted)]'}`}
                    >
                      {g.name}
                    </button>
                  ))}
                </div>
              )}
              {filteredMatches.length === 0 ? (
                <p data-testid="public-gsk-matches-empty" className="text-xs text-[var(--color-text-muted)]">No matches yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="public-gsk-matches">
                  {filteredMatches.map((m) => (
                    <MatchCard key={m.id} match={m} onClick={setDrawerMatch} />
                  ))}
                </div>
              )}
            </Card>
          )}

          {tab === 'groups' && (
            <div className="space-y-3">
              <h2 className="font-semibold text-[var(--color-text)]">Groups</h2>
              <GskGroupsView groups={groups} standings={standings} qualifyTop={qualifyTop} />
            </div>
          )}

          {tab === 'qualification' && (
            <div className="space-y-3">
              <h2 className="font-semibold text-[var(--color-text)]">Qualification</h2>
              <GskQualificationPanel groupStage={groupStage} groupMatches={groupMatches} />
            </div>
          )}

          {tab === 'knockout' && (
            <div className="space-y-3">
              <h2 className="font-semibold text-[var(--color-text)]">Knockout</h2>
              <GskKnockoutPanel
                tournamentId={t.id}
                tournamentName={t.name}
                bracketTypeName={t.bracket_type}
                sportName={t.sport?.name}
                status={t.status}
                knockoutStage={knockoutStage}
                matches={allMatches}
                participants={[]}
                onMatchClick={setDrawerMatch}
              />
            </div>
          )}

          {tab === 'standings' && (
            <Card>
              <h2 className="font-semibold text-[var(--color-text)] mb-3" data-testid="public-standings-heading">Standings</h2>
              {standings.length === 0 ? (
                <p className="text-xs text-[var(--color-text-muted)]">No standings available yet.</p>
              ) : (
                <div className="overflow-x-auto">
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
                      {standings.map((s: any, i: number) => (
                        <tr key={`${s.group_id ?? 'g'}-${s.rank_position ?? i}`} className="border-b border-[var(--color-border)] last:border-0">
                          <td className="px-2 py-1.5">{s.rank_position ?? '—'}</td>
                          <td className="px-2 py-1.5">{s.player_name ?? '—'}</td>
                          <td className="px-2 py-1.5">{s.points ?? 0}</td>
                          <td className="px-2 py-1.5">{s.wins ?? 0} / {s.losses ?? 0} / {s.draws ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </>
      ) : (
        <>
          {overviewBlocks}

          {/* Non-GSK keeps the previous single shared TournamentBracket. */}
          {Array.isArray(t.bracket) && t.bracket.length > 0 && (
            <Card>
              <h2 className="font-semibold text-[var(--color-text)] mb-3" data-testid="public-bracket-heading">Bracket</h2>
              <div data-testid="public-bracket">
                <TournamentBracket
                  tournament={{ id: t.id, name: t.name, format: t.format, bracket_type_name: t.bracket_type, status: t.status, sport_name: t.sport?.name }}
                  matches={allMatches}
                />
              </div>
            </Card>
          )}

          {standings.length > 0 && (
            <Card>
              <h2 className="font-semibold text-[var(--color-text)] mb-3" data-testid="public-standings-heading">Standings</h2>
              <div className="overflow-x-auto">
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
                    {standings.map((s: any, i: number) => (
                      <tr key={s.rank_position ?? i} className="border-b border-[var(--color-border)] last:border-0">
                        <td className="px-2 py-1.5">{s.rank_position ?? '—'}</td>
                        <td className="px-2 py-1.5">{s.player_name ?? '—'}</td>
                        <td className="px-2 py-1.5">{s.points ?? 0}</td>
                        <td className="px-2 py-1.5">{s.wins ?? 0} / {s.losses ?? 0} / {s.draws ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      <p className="text-xs text-[var(--color-text-muted)]">
        Want to join?{' '}
        <Link to="/login" className="text-[var(--color-primary)] hover:underline">Sign in</Link>
        {' '}to register for this tournament.
      </p>

      {isGsk && (
        <MatchDetailsDrawer
          open={Boolean(drawerMatch)}
          onClose={() => setDrawerMatch(null)}
          match={drawerMatch}
          matches={allMatches}
          onSelectMatch={setDrawerMatch}
        />
      )}
    </div>
  );
}
