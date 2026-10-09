import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { tournamentRefundApi, tournamentApi } from '../../services/tournament';
import { Skeleton, SkeletonRow } from '../../components/ui/Skeleton';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { Can } from '../../permissions/Can';
import { GeneratedRules } from '../../components/tournaments/GeneratedRules';
import { PrizeList } from '../../components/tournaments/PrizeList';
import SponsorList from '../../components/tournaments/SponsorList';
import EligibilitySummary from '../../components/tournaments/EligibilitySummary';
import { useTranslation } from '../../i18n';
import { translateEligibilityError } from '../../lib/tournamentEligibility';
import { formatISODate } from '../../utils/formatDate';
import { formatPrice } from '../../utils/currency';
import { useAuthStore } from '../../store/auth.store';
import { useCan } from '../../hooks/useCan';
import { TournamentBracket } from '../../components/tournaments/TournamentBracket';
import { matchPredictionLabel } from '../../components/tournaments/matchSideLabel';
import { MatchCard } from '../../components/tournaments/MatchCard';
import { MatchDetailsDrawer } from '../../components/tournaments/MatchDetailsDrawer';
import { TournamentPrintView } from '../../components/tournaments/TournamentPrintView';
import { GskGroupsView, GskQualificationPanel, GskKnockoutPanel } from '../../components/tournaments/hub/GskCompetitionViews';
import type { TournamentMatchNode } from '../../types/tournamentBracket';

type Tab = 'overview' | 'bracket' | 'matches' | 'groups' | 'qualification' | 'standings' | 'players';

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  published: 'bg-blue-100 text-blue-700',
  registration_open: 'bg-green-100 text-green-700',
  registration_closed: 'bg-amber-100 text-amber-700',
  running: 'bg-purple-100 text-purple-700',
  completed: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-700',
  archived: 'bg-gray-100 text-gray-500',
};

/**
 * Group 3 — human-readable payment label from the backend's EFFECTIVE allowed
 * registration payment methods. Never exposes internal details and never shows
 * Wallet (the backend can never return it). When the tournament is free the
 * fee cell shows "Free".
 */
export function paymentMethodsLabel(
  methods: string[] | undefined | null,
  entryFee: number | undefined | null,
): string | null {
  const fee = Number(entryFee ?? 0);
  if (fee <= 0) return 'Free';
  const set = Array.isArray(methods) ? methods.filter((m) => m === 'cash' || m === 'card') : [];
  if (set.length === 0) return '—';
  if (set.length === 1) return set[0] === 'cash' ? 'Cash' : 'Card / Online';
  return 'Cash or Card / Online';
}

export default function TournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const { can } = useCan();
  const [tab, setTab] = useState<Tab>('overview');
  const [drawerMatch, setDrawerMatch] = useState<TournamentMatchNode | null>(null);
  const [printRequested, setPrintRequested] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerMethod, setRegisterMethod] = useState<'cash' | 'card' | ''>('');
  // G11.18 Phase 2 — the player selects a competition category when the
  // tournament hosts multiple ones; single/default tournaments need no click.
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<number | undefined>(undefined);

  const { data: tournament, isLoading, isError: tournamentError, error: tournamentQueryError, refetch: refetchTournament } = useQuery({
    queryKey: ['tournament', id],
    queryFn: () => api.get(`/tournaments/${id}`).then(r => r.data.data || r.data),
  });

  const { data: competitions, isError: competitionsError, refetch: refetchCompetitions } = useQuery({
    queryKey: ['tournament', id, 'competitions'],
    queryFn: () => api.get(`/tournaments/${id}/competitions`).then(r => r.data?.data ?? []),
  });

  const { data: matches, isLoading: loadingMatches, isError: matchesError, refetch: refetchMatches } = useQuery({
    queryKey: ['tournament', id, 'bracket'],
    queryFn: () => api.get(`/tournaments/${id}/matches`).then(r => r.data.data),
  });

  const { data: standings, isLoading: loadingStandings, isError: standingsError, refetch: refetchStandings } = useQuery({
    queryKey: ['tournament', id, 'standings'],
    queryFn: () => api.get(`/tournaments/${id}/standings`).then(r => r.data.data),
  });

  const { data: participants, isLoading: loadingParticipants, isError: participantsError, refetch: refetchParticipants } = useQuery({
    queryKey: ['tournament', id, 'participants'],
    queryFn: () => api.get(`/tournaments/${id}/participants`).then(r => r.data.data),
  });

  // ── Step 4C — GSK read-only competition data (Player) ──
  // Group-stage names and stage configuration are read through the EXISTING
  // `tournament.view` endpoints (the same permission the player already holds
  // for `/tournaments/:id/*`). These are read-only GETs — no organizer actions.
  const isGsk = (tournament as any)?.format === 'group_stage_knockout';
  const canViewStages = can('tournament.view');
  const { data: gskGroups, isLoading: loadingGroups, isError: groupsError, refetch: refetchGroups } = useQuery({
    queryKey: ['tournament', id, 'groups'],
    queryFn: () => tournamentApi.getGroups(Number(id)),
    enabled: Boolean(id) && isGsk && canViewStages,
  });
  const { data: gskStages, isLoading: loadingStages, isError: stagesError, refetch: refetchStages } = useQuery({
    queryKey: ['tournament', id, 'stages'],
    queryFn: () => tournamentApi.getStages(Number(id)),
    enabled: Boolean(id) && isGsk && canViewStages,
  });
  const groupStage = Array.isArray(gskStages) ? gskStages.find((s: any) => s.progression_format === 'round_robin') ?? null : null;
  const knockoutStage = Array.isArray(gskStages) ? gskStages.find((s: any) => s.progression_format === 'knockout') ?? null : null;

  // Group 3 — player registration with the tournament's effective allowed
  // payment methods (Cash / Card). Free tournaments register without a method.
  // G11.18 Phase 2 — the selected competitionId is sent to the registration API.
  const registerMutation = useMutation({
    mutationFn: (method: 'cash' | 'card' | '') =>
      api.post(`/tournaments/${id}/register`, {
        payment_method: method || undefined,
        competition_id: selectedCompetitionId,
      }).then(r => r.data),
    onSuccess: () => {
      showToast('Registered successfully!', 'success');
      setShowRegisterModal(false);
      setRegisterMethod('');
      setSelectedCompetitionId(undefined);
      qc.invalidateQueries({ queryKey: ['tournament', id] });
      qc.invalidateQueries({ queryKey: ['tournament', id, 'participants'] });
      qc.invalidateQueries({ queryKey: ['my-tournaments'] });
    },
    onError: (e: any) => showToast(translateEligibilityError(t, e, e?.response?.data?.message || 'Registration failed'), 'error'),
  });

  // G11.3 — player requests a FULL registration refund (own registration only).
  // Computed from the raw participants query BEFORE any early return so hooks
  // keep constant order; participantList (post-guard derived) is not used here.
  const participantRaw = Array.isArray(participants) ? participants : [];
  const myRegistrationId = participantRaw.find((p: any) => Number(p.player_id) === Number(user?.id))?.registration_id ?? undefined;
  const { data: myRefundRequest, isLoading: loadingRefundRequest, isError: refundRequestError, refetch: refetchRefundRequest } = useQuery({
    queryKey: ['tournament', id, 'refund-request', myRegistrationId],
    queryFn: () => tournamentRefundApi.getMyRefundRequest(Number(myRegistrationId!)).then((r) => r.status ? r : null),
    enabled: Boolean(myRegistrationId),
  });
  const refundMutation = useMutation({
    mutationFn: () => tournamentRefundApi.requestRefund(Number(myRegistrationId)),
    onSuccess: () => {
      showToast('Refund request submitted for approval', 'success');
      qc.invalidateQueries({ queryKey: ['tournament', id, 'refund-request', myRegistrationId] });
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Refund request failed', 'error'),
  });

  if (isLoading) return <div className="space-y-4"><Skeleton width={300} height={28} /><SkeletonRow count={6} /></div>;
  // F-02 — a fetch failure must not masquerade as "Tournament not found.".
  // The backend responds HTTP 404 (NotFoundError → TOURNAMENT_NOT_FOUND) for a
  // missing tournament, while transport/server failures have no response body,
  // so a genuine not-found is preserved and only other failures show Retry.
  if (tournamentError) {
    if ((tournamentQueryError as unknown as { response?: { status?: number } })?.response?.status === 404) {
      return <p className="text-[var(--color-text-muted)] text-center py-8">Tournament not found.</p>;
    }
    return (
      <div className="text-center py-14">
        <p className="text-sm text-[var(--color-error)]">Unable to load tournament.</p>
        <button onClick={() => refetchTournament()}
          className="mt-4 px-4 py-2 text-sm font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90">
          {t('common.retry')}
        </button>
      </div>
    );
  }
  if (!tournament) return <p className="text-[var(--color-text-muted)] text-center py-8">Tournament not found.</p>;

  const matchList = Array.isArray(matches) ? matches : [];
  const standingList = Array.isArray(standings) ? standings : [];
  const participantList = Array.isArray(participants) ? participants : [];
  const myRegistration = participantList.find((p: any) => Number(p.player_id) === Number(user?.id));
  const groupMatches = groupStage ? matchList.filter((m: any) => Number(m.stage_id) === Number(groupStage.id)) : [];
  // Step 4C — GSK tabs are additive; non-GSK keeps its exact existing tabs.
  const TABS: Tab[] = isGsk
    ? ['overview', 'matches', 'groups', 'qualification', 'bracket', 'standings', 'players']
    : ['overview', 'bracket', 'matches', 'standings', 'players'];
  const tabLabel = (tb: Tab): string => {
    switch (tb) {
      case 'overview': return 'Overview';
      case 'bracket': return isGsk ? 'Knockout' : 'Bracket';
      case 'matches': return 'Matches';
      case 'groups': return 'Groups';
      case 'qualification': return 'Qualification';
      case 'standings': return 'Standings';
      default: return 'Players';
    }
  };
  const registerPaymentMethods = Array.isArray(tournament?.effective_registration_payment_methods)
    ? (tournament.effective_registration_payment_methods as string[])
    : [];
  // G11.18 Phase 2 — competition categories exposed to the registration flow.
  const compList = Array.isArray(competitions) ? (competitions as any[]) : [];
  const multiple = compList.length > 1;
  const selectedComp = compList.find((c) => Number(c.id) === Number(selectedCompetitionId));
  const displayFee = selectedComp ? Number(selectedComp.entry_fee ?? tournament.entry_fee ?? 0) : Number(tournament.entry_fee ?? 0);
  const displayCurrency = selectedComp?.currency_code ?? tournament?.currency_code ?? 'EGP';
  const venue = tournament?.venue || null;
  const venueAddress = [venue?.addressLine1, venue?.addressLine2, venue?.city].filter(Boolean).join(', ');
  const dailyWindow = tournament?.daily_start_time && tournament?.daily_end_time
    ? `${String(tournament.daily_start_time).slice(0, 5)} – ${String(tournament.daily_end_time).slice(0, 5)}`
    : null;

  return (
    <>
    <div className="space-y-6 cz-no-print">
      <button onClick={() => navigate('/tournaments')} className="text-sm text-[var(--color-primary)] hover:underline">← Back to Tournaments</button>

      {/* Header */}
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            {tournament.sport_icon && (
              <img src={tournament.sport_icon} alt={tournament.sport_name || 'sport'} className="w-10 h-10 rounded-lg object-cover bg-[var(--color-bg)]" />
            )}
            <div>
              <h1 className="text-xl font-bold text-[var(--color-text)]">{tournament.name}</h1>
              <p className="text-sm text-[var(--color-text-muted)] capitalize">
                {tournament.sport_name || '—'}{tournament.bracket_type_name ? ` • ${tournament.bracket_type_name}` : ''}
                {tournament.format ? ` • ${tournament.format}` : ''}
              </p>
            </div>
          </div>
          <span className={`px-3 py-1 text-xs font-medium rounded-full capitalize ${STATUS_BADGE[tournament.status] || 'bg-yellow-100 text-yellow-700'}`}>{tournament.status}</span>
        </div>
        {tournament.description && <p className="text-sm text-[var(--color-text-muted)]">{tournament.description}</p>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span className="text-[var(--color-text-muted)]">Organisation:</span> <span className="font-medium">{tournament.organisation_name || '—'}</span></div>
          <div><span className="text-[var(--color-text-muted)]">Venue:</span> <span className="font-medium">{venue ? venue.name : '—'}</span>
            {venue?.mapsUrl && (
              <a href={venue.mapsUrl} target="_blank" rel="noreferrer" className="block text-xs text-[var(--color-primary)] underline">View on Map</a>
            )}
          </div>
          <div><span className="text-[var(--color-text-muted)]">Players:</span> <span className="font-medium">{participantsError ? '—' : `${participantList.length}/${tournament.max_participants}`}</span></div>
          <div><span className="text-[var(--color-text-muted)]">Fee:</span> <span className="font-medium">{formatPrice(Number(tournament.entry_fee ?? 0), tournament.currency_code)}</span></div>
          <div><span className="text-[var(--color-text-muted)]">Payment:</span> <span className="font-medium">{paymentMethodsLabel(registerPaymentMethods, Number(tournament.entry_fee ?? 0))}</span></div>
          <div><span className="text-[var(--color-text-muted)]">Registration deadline:</span> <span className="font-medium">{tournament.registration_deadline ? formatISODate(tournament.registration_deadline) : '—'}</span></div>
          <div><span className="text-[var(--color-text-muted)]">Dates:</span> <span className="font-medium">{tournament.start_date ? formatISODate(tournament.start_date) : '—'}{tournament.end_date ? ` – ${formatISODate(tournament.end_date)}` : ''}</span></div>
          <div><span className="text-[var(--color-text-muted)]">Playing Time:</span> <span className="font-medium">{dailyWindow || '—'}</span></div>
        </div>
        {venueAddress && (
          <p className="text-xs text-[var(--color-text-muted)]">{venueAddress}</p>
        )}
        {venue?.mapsUrl && (
          <a href={venue.mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline">
            View on Map ↗
          </a>
        )}
        <PrizeList prizes={tournament.prizes} legacyDescription={tournament.prize_description} />
        <SponsorList sponsors={tournament.sponsors} showAmount={false} />
        <EligibilitySummary tournament={tournament} />
        {tournament.rules && (
          <GeneratedRules rules={tournament.rules} title="Tournament Rules" />
        )}
        {myRegistration && (
          <p className="text-xs font-medium">
            Your registration: <span className="capitalize">{myRegistration.status}</span>
            {myRegistration.seed_rank != null ? ` • Seed ${myRegistration.seed_rank}` : ''}
          </p>
        )}
        {!myRegistration && !participantsError && ['published', 'registration_open'].includes(tournament.status) && (
          <Can permission="player.tournaments.register">
            <button onClick={() => setShowRegisterModal(true)} className="btn-primary text-sm">
              {registerPaymentMethods.length === 0 ? 'Register' : 'Register & Pay'}
            </button>
          </Can>
        )}
        {/* G11.3 — player registration refund request (own registration; approval by the organisation) */}
        {myRegistration && (
          <Can permission="tournaments.registration.refund-request">
            <div className="border-t border-[var(--color-border)] pt-3 mt-3 w-full">
              <p className="text-xs font-medium text-[var(--color-text)] mb-1">Registration Refund</p>
              {loadingRefundRequest ? (
                <p className="text-xs text-[var(--color-text-muted)]">{t('common.loading')}</p>
              ) : refundRequestError ? (
                <div>
                  <p className="text-xs text-[var(--color-error)]">Unable to load refund request.</p>
                  <button onClick={() => refetchRefundRequest()}
                    className="mt-2 text-xs font-medium text-[var(--color-primary)] underline">{t('common.retry')}</button>
                </div>
              ) : myRefundRequest ? (
                <p className="text-xs text-[var(--color-text-muted)]">
                  Status: <span className="capitalize font-semibold text-[var(--color-text)]">{String(myRefundRequest.status)}</span>
                  {myRefundRequest.rejection_reason ? ` — ${myRefundRequest.rejection_reason}` : ''}
                </p>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-xs text-[var(--color-text-muted)]">Request a full refund before the draw is locked.</p>
                  <button onClick={() => refundMutation.mutate()} disabled={refundMutation.isPending}
                    className="text-xs btn-secondary">{refundMutation.isPending ? 'Requesting...' : 'Request Refund'}</button>
                </div>
              )}
            </div>
          </Can>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} role="tab" aria-selected={tab === t}
            className={`px-3 py-1.5 text-xs font-medium rounded-full ${tab === t ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-bg)] text-[var(--color-text-muted)]'}`}>
            {tabLabel(t)}
          </button>
        ))}
      </div>

      {/* ELO / Awards section */}
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
        <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">ELO Ranking & Awards</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div><p className="text-xs text-[var(--color-text-muted)]">Top ELO</p><p className="text-lg font-bold text-[var(--color-text)]">—</p><p className="text-[10px] text-[var(--color-text-muted)]">After tournament</p></div>
          <div><p className="text-xs text-[var(--color-text-muted)]">Prize Pool</p><p className="text-lg font-bold text-yellow-600">{(Array.isArray(tournament.prizes) && tournament.prizes.length ? `${tournament.prizes.length} prize${tournament.prizes.length > 1 ? 's' : ''}` : tournament.prize_description) || '—'}</p></div>
          <div><p className="text-xs text-[var(--color-text-muted)]">Matches Played</p><p className="text-lg font-bold">{matchesError ? '—' : matchList.filter((m: any) => m.status === 'completed').length}</p></div>
          <div><p className="text-xs text-[var(--color-text-muted)]">Registered Players</p><p className="text-lg font-bold">{participantsError ? '—' : participantList.length}</p></div>
        </div>
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
            <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Match Summary</h2>
            {matchesError ? (
              <div>
                <p className="text-xs text-[var(--color-error)]">Unable to load matches.</p>
                <button onClick={() => refetchMatches()}
                  className="mt-3 px-3 py-1.5 text-xs font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90">
                  {t('common.retry')}
                </button>
              </div>
            ) : matchList.length === 0 ? <p className="text-xs text-[var(--color-text-muted)]">No matches yet.</p> : (
              <div className="space-y-2">
                {matchList.map((m: any, i: number) => (
                  <div key={m.id ?? i} className="flex items-center justify-between text-xs py-1 border-b border-[var(--color-border)] last:border-0">
                    <span>R{m.round} M{m.bracket_position ?? m.match_number}</span>
                    <span className="text-[var(--color-text-muted)]">{matchPredictionLabel(m, t)}</span>
                    <span className={`px-1.5 py-0.5 rounded ${m.status === 'completed' ? 'bg-green-100 text-green-700' : m.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{m.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
            <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Players</h2>
            {loadingParticipants ? (
              <SkeletonRow count={2} />
            ) : participantsError ? (
              <div>
                <p className="text-xs text-[var(--color-error)]">Unable to load participants.</p>
                <button onClick={() => refetchParticipants()}
                  className="mt-3 px-3 py-1.5 text-xs font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90">
                  {t('common.retry')}
                </button>
              </div>
            ) : participantList.length === 0 ? <p className="text-xs text-[var(--color-text-muted)]">No participants yet.</p> : (
              <div className="flex flex-wrap gap-2">
                {participantList.map((p: any) => (
                  <span key={p.id} className="px-2 py-1 text-xs bg-[var(--color-bg)] rounded-full capitalize">{p.player_name || `Player #${p.player_id}`} <span className="text-[var(--color-text-muted)]">(seed {p.seed_rank ?? '—'})</span></span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bracket / Knockout Tab */}
      {tab === 'bracket' && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-sm font-semibold text-[var(--color-text)]">{isGsk ? 'Knockout' : 'Bracket'}</h2>
            {matchList.length > 0 && (
              <button
                onClick={() => {
                  setPrintRequested(true);
                  setTimeout(() => {
                    window.print();
                    setPrintRequested(false);
                  }, 50);
                }}
                className="text-xs text-[var(--color-primary)] hover:underline"
              >
                Print {isGsk ? 'Knockout' : 'Bracket'}
              </button>
            )}
          </div>
          {loadingMatches ? (
            <SkeletonRow count={5} />
          ) : matchesError ? (
            <div className="text-center py-8">
              <p className="text-sm text-[var(--color-error)]">Unable to load the bracket.</p>
              <button onClick={() => refetchMatches()}
                className="mt-4 px-4 py-2 text-sm font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90">
                {t('common.retry')}
              </button>
            </div>
          ) : isGsk ? (
            loadingStages ? (
              <SkeletonRow count={5} />
            ) : stagesError ? (
              <div className="text-center py-8">
                <p className="text-sm text-[var(--color-error)]">Unable to load stages.</p>
                <button onClick={() => refetchStages()}
                  className="mt-4 px-4 py-2 text-sm font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90">
                  {t('common.retry')}
                </button>
              </div>
            ) : (
            <GskKnockoutPanel
              tournamentId={Number(id)}
              tournamentName={tournament.name}
              bracketTypeName={tournament.bracket_type_name}
              sportName={tournament.sport_name}
              status={tournament.status}
              knockoutStage={knockoutStage}
              matches={matchList as TournamentMatchNode[]}
              participants={participantList}
              currentUserId={user?.id}
              onMatchClick={setDrawerMatch}
              footer={(m) =>
                can('matches.result.submit') && m.status !== 'completed' && m.match_id != null ? (
                  <button
                    onClick={() => navigate(`/matches/${m.match_id}/result`)}
                    className="text-[10px] text-[var(--color-primary)] hover:underline"
                  >
                    Enter Score
                  </button>
                ) : null
              }
            />
            )
          ) : (
            <TournamentBracket
              tournament={tournament}
              matches={matchList}
              participants={participantList}
              currentUserId={user?.id}
              onMatchClick={setDrawerMatch}
              footer={(m) =>
                can('matches.result.submit') && m.status !== 'completed' && m.match_id != null ? (
                  <button
                    onClick={() => navigate(`/matches/${m.match_id}/result`)}
                    className="text-[10px] text-[var(--color-primary)] hover:underline"
                  >
                    Enter Score
                  </button>
                ) : null
              }
            />
          )}
          {!isGsk && !loadingMatches && !matchesError && matchList.length === 0 && (
            <p className="text-xs text-[var(--color-text-muted)] text-center py-8">Bracket not yet generated.</p>
          )}
        </div>
      )}

      {/* Groups Tab (GSK only) */}
      {tab === 'groups' && isGsk && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text)] mb-4">Groups</h2>
          {loadingGroups ? (
            <SkeletonRow count={3} />
          ) : groupsError ? (
            <div>
              <p className="text-sm text-[var(--color-error)]">Unable to load groups.</p>
              <button onClick={() => refetchGroups()}
                className="mt-3 px-3 py-1.5 text-xs font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90">
                {t('common.retry')}
              </button>
            </div>
          ) : standingsError ? (
            <div>
              <p className="text-sm text-[var(--color-error)]">Unable to load standings.</p>
              <button onClick={() => refetchStandings()}
                className="mt-3 px-3 py-1.5 text-xs font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90">
                {t('common.retry')}
              </button>
            </div>
          ) : (
            <GskGroupsView
              groups={Array.isArray(gskGroups) ? gskGroups : []}
              standings={standingList}
              highlightRegistrationId={myRegistrationId}
            />
          )}
        </div>
      )}

      {/* Qualification Tab (GSK only, read-only) */}
      {tab === 'qualification' && isGsk && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text)] mb-4">Qualification</h2>
          {loadingStages ? (
            <SkeletonRow count={3} />
          ) : stagesError ? (
            <div>
              <p className="text-sm text-[var(--color-error)]">Unable to load stages.</p>
              <button onClick={() => refetchStages()}
                className="mt-3 px-3 py-1.5 text-xs font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90">
                {t('common.retry')}
              </button>
            </div>
          ) : matchesError ? (
            <div>
              <p className="text-sm text-[var(--color-error)]">Unable to load matches.</p>
              <button onClick={() => refetchMatches()}
                className="mt-3 px-3 py-1.5 text-xs font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90">
                {t('common.retry')}
              </button>
            </div>
          ) : (
            <GskQualificationPanel groupStage={groupStage} groupMatches={groupMatches} />
          )}
        </div>
      )}

      {/* Matches Tab */}
      {tab === 'matches' && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text)] mb-4">Matches</h2>
          {loadingMatches ? (
            <SkeletonRow count={5} />
          ) : matchesError ? (
            <div className="text-center py-8">
              <p className="text-sm text-[var(--color-error)]">Unable to load matches.</p>
              <button onClick={() => refetchMatches()}
                className="mt-4 px-4 py-2 text-sm font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90">
                {t('common.retry')}
              </button>
            </div>
          ) : matchList.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)] text-center py-8">No matches yet.</p>
          ) : (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {matchList.map((m) => (
                <MatchCard key={m.id} match={m} currentUserId={user?.id} onClick={setDrawerMatch} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Standings Tab */}
      {tab === 'standings' && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
          <h2 className="text-sm font-semibold text-[var(--color-text)] p-5 pb-0">Standings</h2>
          {loadingStandings ? (
            <SkeletonRow count={5} />
          ) : standingsError ? (
            <div className="p-5">
              <p className="text-xs text-[var(--color-error)]">Unable to load standings.</p>
              <button onClick={() => refetchStandings()}
                className="mt-3 px-3 py-1.5 text-xs font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90">
                {t('common.retry')}
              </button>
            </div>
          ) : standingList.length === 0 ? (
            <p className="p-5 text-xs text-[var(--color-text-muted)]">No standings available yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)] text-xs">
                <th className="text-left px-4 py-3">#</th><th className="text-left px-4 py-3">Player</th><th className="text-center px-2 py-3">Pts</th><th className="text-center px-2 py-3">W</th><th className="text-center px-2 py-3">L</th><th className="text-center px-2 py-3">GF</th><th className="text-center px-2 py-3">GA</th>
              </tr></thead>
              <tbody>{standingList.map((s: any, i: number) => (
                <tr key={s.id ?? i} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2 text-xs font-bold">{s.rank_position ?? i + 1}</td>
                  <td className="px-4 py-2 text-xs font-medium">{s.player_name || `Player #${s.registration_id}`}</td>
                  <td className="px-2 py-2 text-xs text-center font-bold">{s.points}</td>
                  <td className="px-2 py-2 text-xs text-center text-green-600">{s.wins}</td>
                  <td className="px-2 py-2 text-xs text-center text-red-600">{s.losses}</td>
                  <td className="px-2 py-2 text-xs text-center">{s.games_won}</td>
                  <td className="px-2 py-2 text-xs text-center">{s.games_lost}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {/* Players Tab */}
      {tab === 'players' && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
          <h2 className="text-sm font-semibold text-[var(--color-text)] p-5 pb-0">Participants</h2>
          {loadingParticipants ? (
            <SkeletonRow count={3} />
          ) : participantsError ? (
            <div className="p-5">
              <p className="text-xs text-[var(--color-error)]">Unable to load participants.</p>
              <button onClick={() => refetchParticipants()}
                className="mt-3 px-3 py-1.5 text-xs font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90">
                {t('common.retry')}
              </button>
            </div>
          ) : participantList.length === 0 ? (
            <p className="p-5 text-xs text-[var(--color-text-muted)]">No participants yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)] text-xs">
                <th className="text-left px-4 py-3">Seed</th><th className="text-left px-4 py-3">Player</th><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Registered</th>
              </tr></thead>
              <tbody>{participantList.map((p: any) => (
                <tr key={p.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2 text-xs font-bold">#{p.seed_rank ?? '—'}</td>
                  <td className="px-4 py-2 text-xs">{p.player_name || `Player #${p.player_id}`}</td>
                  <td className="px-4 py-2 text-xs capitalize">{p.status}</td>
                  <td className="px-4 py-2 text-xs text-[var(--color-text-muted)]">{formatISODate(p.registered_at)}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {/* Group 3 — player registration with the effective allowed payment methods */}
      <Modal open={showRegisterModal} onClose={() => setShowRegisterModal(false)}
        title="Register for Tournament" size="sm">
        <div className="space-y-4">
          {competitionsError && (
            <div className="rounded-[var(--radius-md)] border border-[var(--color-error)] p-3">
              <p className="text-xs text-[var(--color-error)]">Unable to load competitions.</p>
              <button onClick={() => refetchCompetitions()}
                className="mt-2 text-xs font-medium text-[var(--color-primary)] underline">{t('common.retry')}</button>
            </div>
          )}
          {multiple && (
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">Competition Category</label>
              <div className="space-y-2">
                {compList.map((c) => (
                  <label key={c.id} className="flex items-center justify-between gap-2 text-sm text-[var(--color-text)] border border-[var(--color-border)] rounded px-3 py-2">
                    <span className="flex items-center gap-2">
                      <input type="radio" name="regComp" value={c.id}
                        checked={Number(selectedCompetitionId) === Number(c.id)}
                        onChange={() => setSelectedCompetitionId(Number(c.id))} />
                      <span>{c.name} <span className="text-xs text-[var(--color-text-muted)]">({String(c.competition_type || '').toUpperCase()})</span></span>
                    </span>
                    <span className="font-medium">{formatPrice(Number(c.entry_fee ?? 0), c.currency_code ?? 'EGP')}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="text-sm text-[var(--color-text-muted)]">
            Entry fee: <span className="font-semibold text-[var(--color-text)]">{formatPrice(displayFee, displayCurrency)}</span>
          </div>
          {displayFee > 0 ? (
            <>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5">Payment Method</label>
                <div className="space-y-2">
                  {registerPaymentMethods.includes('cash') && (
                    <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
                      <input type="radio" name="regMethod" value="cash"
                        checked={registerMethod === 'cash'} onChange={() => setRegisterMethod('cash')} />
                      Cash
                    </label>
                  )}
                  {registerPaymentMethods.includes('card') && (
                    <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
                      <input type="radio" name="regMethod" value="card"
                        checked={registerMethod === 'card'} onChange={() => setRegisterMethod('card')} />
                      Card / Online
                    </label>
                  )}
                </div>
                {registerPaymentMethods.length === 0 && (
                  <p className="text-xs text-[var(--color-error)] mt-1">No payment method is available for this tournament.</p>
                )}
              </div>
              <button onClick={() => registerMutation.mutate(registerMethod)}
                disabled={!registerMethod || registerMutation.isPending || competitionsError || (multiple && !selectedCompetitionId)}
                className="w-full px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50">
                {registerMutation.isPending ? 'Registering...' : 'Register & Pay'}
              </button>
            </>
          ) : (
            <button onClick={() => registerMutation.mutate('')}
              disabled={registerMutation.isPending || competitionsError || (multiple && !selectedCompetitionId)}
              className="w-full px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50">
              {registerMutation.isPending ? 'Registering...' : 'Register'}
            </button>
          )}
          {registerMutation.isError && (
            <p className="text-xs text-[var(--color-error)]">Registration failed. Please try again.</p>
          )}
        </div>
      </Modal>
      <MatchDetailsDrawer
        open={Boolean(drawerMatch)}
        onClose={() => setDrawerMatch(null)}
        match={drawerMatch}
        currentUserId={user?.id}
        matches={matchList}
        onSelectMatch={setDrawerMatch}
      />
    </div>
    {printRequested && (
      <div className="cz-print-area hidden print:block print-only-area">
        {tournament && (
          <TournamentPrintView tournament={tournament} matches={matchList} participants={participantList} currentUserId={user?.id} />
        )}
      </div>
    )}
    </>
  );
}