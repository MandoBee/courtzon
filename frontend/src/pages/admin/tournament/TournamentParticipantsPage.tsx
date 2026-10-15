import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../../../i18n';
import { useToast } from '../../../components/ui/Toast';
import { Can } from '../../../permissions/Can';
import { SkeletonRow } from '../../../components/ui/Skeleton';
import { tournamentApi, tournamentParticipantApi, orgTournamentParticipantApi, orgTournamentApi } from '../../../services/tournament';
import { getErrorMessage } from '../../../utils/errors';

export type TournamentParticipantsContextMode = 'admin' | 'org';

interface Props {
  mode?: TournamentParticipantsContextMode;
  orgId?: string;
}

interface Member {
  id?: number;
  user_id: number;
  full_name?: string | null;
  status: string;
  member_order: number;
}

/**
 * Group 5 + Group 6 + Group 7 — Participants, Seeding, Draw foundation AND
 * pair/team management.
 *
 * Group 7 adds the authoritative member model (a participant card shows Team A
 * → Seed #3 → Members), member add/remove, pair/team creation, and the durable
 * player-replacement-request workflow (pending → approve/reject/cancel) with
 * draw-impact reporting. The full Draw UI (drag & drop) is intentionally NOT
 * built here.
 */
export default function TournamentParticipantsPage({ mode = 'admin', orgId: orgIdProp }: Props) {
  const params = useParams<{ id: string; orgId?: string }>();
  const tournamentId = Number(params.id);
  const orgId = orgIdProp ?? params.orgId;
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const qc = useQueryClient();

  const isOrg = mode === 'org';
  const api = isOrg && orgId ? orgTournamentParticipantApi : tournamentParticipantApi;
  const wrap = (fn: (...a: any[]) => any, ...a: any[]) => (isOrg && orgId ? fn(orgId, ...a) : fn(...a));

  const [seedTarget, setSeedTarget] = useState<{ participantId: number; seedNumber: string; source: 'rating' | 'manual'; reason: string } | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<{ withdrawnId: number; replacementId: number; competitionId?: number | null } | null>(null);
  // Group 7 state
  const [createTarget, setCreateTarget] = useState<{ type: 'pair' | 'team' } | null>(null);
  // B4 — pair/team member SELECTION (replaces raw numeric user-id entry).
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [pairCompetition, setPairCompetition] = useState<number | ''>('');
  const [addMemberTarget, setAddMemberTarget] = useState<{ participantId: number } | null>(null);
  const [requestTarget, setRequestTarget] = useState<{ participantId: number; members: Member[] } | null>(null);

  const { data, isLoading, isError: participantsError, refetch: refetchParticipants } = useQuery({
    queryKey: ['tournament-participants', tournamentId],
    queryFn: () => wrap(api.getParticipants, tournamentId),
  });
  const participants = Array.isArray(data) ? data : [];

  // G11.18 Phase 3 — the draw operations are competition-scoped. The competitions
  // must be resolved FIRST so we know whether an explicit selection is required.
  const { data: competitionsData, isError: competitionsError, refetch: refetchCompetitions } = useQuery({
    queryKey: ['tournament-competitions', tournamentId],
    queryFn: () => tournamentApi.listCompetitions(tournamentId),
    enabled: isOrg ? Boolean(orgId) : true,
  });
  const competitionList: any[] = Array.isArray(competitionsData) ? competitionsData : [];
  const needsCompetitionChoice = competitionList.length > 1;
  // When the tournament owns more than one competition the operator MUST select
  // which one to draw; the server rejects an ambiguous (unscoped) request rather
  // than picking one. Omitted scope (0/1 competition) keeps legacy behavior.
  const [drawCompetition, setDrawCompetition] = useState<number | ''>('');
  const scopedDrawCompetition = needsCompetitionChoice && drawCompetition !== '' ? Number(drawCompetition) : null;
  const missingDrawCompetitionChoice = needsCompetitionChoice && drawCompetition === '';

  // ── B4 — doubles pairing: NAME-searchable selection of REGISTERED players ──
  // Candidates are the tournament's registrations (the authoritative "registered
  // players"): `player_id` + `player_name` ONLY — phone numbers are never exposed.
  const { data: registrationsData } = useQuery({
    queryKey: ['tournament-registrations', tournamentId, isOrg ? orgId : 'admin'],
    queryFn: () => (isOrg && orgId
      ? orgTournamentApi.getRegistrations(orgId, tournamentId)
      : tournamentApi.getRegistrations(tournamentId)),
    enabled: isOrg ? Boolean(orgId) : true,
  });
  const registrationRows: any[] = Array.isArray(registrationsData) ? registrationsData : [];

  // A SOLE competition is selected automatically (verified by the competitions
  // list); several require an explicit choice. There is deliberately NO
  // tournament-wide fallback for the exclusion scope.
  const soleCompetitionId = competitionList.length === 1 ? Number(competitionList[0].id) : null;
  const pairCompetitionId: number | null =
    soleCompetitionId ?? (pairCompetition === '' ? null : Number(pairCompetition));
  const needsPairCompetitionChoice = competitionList.length > 1 && pairCompetition === '';
  const pairScopeResolved = !needsPairCompetitionChoice;

  // B4 — active membership resolved against the SELECTED competition only.
  //  • scope known + the participant's competition is unknown/null → the association
  //    cannot be verified, so the player is NEVER offered as available (no false
  //    "available"); a clear reason is shown instead.
  //  • scope known + a DIFFERENT known competition → a different competition, so the
  //    player is NOT excluded.
  //  • no scope (legacy / no competitions) → the whole tournament is the scope.
  const activeMembership = useMemo(() => {
    const inScope = new Set<number>();
    const unscoped = new Set<number>();
    const scope = pairCompetitionId == null ? null : Number(pairCompetitionId);
    for (const p of participants as any[]) {
      const members: any[] = Array.isArray(p?.members) ? p.members : [];
      const activeUserIds = members
        .filter((m) => m?.status === 'active')
        .map((m) => Number(m.user_id));
      if (activeUserIds.length === 0) continue;
      const raw = p?.competition_id;
      if (scope == null) {
        for (const id of activeUserIds) inScope.add(id);
      } else if (raw == null) {
        for (const id of activeUserIds) unscoped.add(id);
      } else if (Number(raw) === scope) {
        for (const id of activeUserIds) inScope.add(id);
      }
    }
    return { inScope, unscoped };
  }, [participants, pairCompetitionId]);

  const candidatePlayers = useMemo(() => {
    if (!pairScopeResolved) return [] as Array<{ id: number; name: string; unavailableReason?: string }>;
    const seen = new Set<number>();
    const out: Array<{ id: number; name: string; unavailableReason?: string }> = [];
    for (const r of registrationRows) {
      const id = Number(r?.player_id ?? 0);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const name = String(r?.player_name ?? '').trim() || `Player #${id}`;
      const unavailableReason = activeMembership.inScope.has(id)
        ? t('tournaments.pair_player_already_assigned', 'Already in a pair/team')
        : activeMembership.unscoped.has(id)
          ? t('tournaments.pair_player_assignment_unknown', 'Availability cannot be verified for the selected competition')
          : undefined;
      out.push({ id, name, unavailableReason });
    }
    return out;
  }, [registrationRows, activeMembership, pairScopeResolved, t]);
  const candidateIdsSignature = candidatePlayers.map((c) => c.id).join(',');

  const selectedPlayers = selectedMemberIds
    .map((id) => candidatePlayers.find((c) => c.id === id))
    .filter((c): c is { id: number; name: string; unavailableReason?: string } => Boolean(c));

  const visibleCandidates = candidatePlayers.filter((c) =>
    c.name.toLowerCase().includes(memberSearch.trim().toLowerCase()),
  );

  // Drop selections invalidated by a refreshed payload or a competition change.
  useEffect(() => {
    setSelectedMemberIds((prev) => {
      const allowed = new Set(
        candidatePlayers.filter((c) => !c.unavailableReason).map((c) => c.id),
      );
      const next = prev.filter((id) => allowed.has(id));
      return next.length === prev.length ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateIdsSignature, pairCompetitionId]);

  // B4 — a COMPETITION CHANGE invalidates every selection outright: the scope itself
  // changed, not merely the candidate set. Clear them so nothing stale is submitted.
  useEffect(() => {
    setSelectedMemberIds([]);
  }, [pairCompetitionId]);

  const { data: draw, isError: drawError, refetch: refetchDraw } = useQuery({
    queryKey: ['tournament-draw', tournamentId, scopedDrawCompetition],
    queryFn: () => wrap(api.getCurrentDraw, tournamentId, scopedDrawCompetition),
    enabled: !missingDrawCompetitionChoice,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['tournament-participants', tournamentId] });
    qc.invalidateQueries({ queryKey: ['tournament-waitlist', tournamentId] });
    qc.invalidateQueries({ queryKey: ['tournament-draw', tournamentId] });
    qc.invalidateQueries({ queryKey: ['tournament-replacement-requests', tournamentId] });
  };

  // G11.20 — the waitlist is competition-scoped: each entry carries its category,
  // the operator can filter to one competition, and "Promote Next" always targets
  // the selected competition explicitly (never an arbitrary one).
  const [waitlistCompetition, setWaitlistCompetition] = useState<number | ''>('');

  const { data: waitlistData, isError: waitlistError, refetch: refetchWaitlist } = useQuery({
    queryKey: ['tournament-waitlist', tournamentId, waitlistCompetition],
    queryFn: () => wrap(api.getWaitlist, tournamentId, waitlistCompetition === '' ? null : waitlistCompetition),
  });
  const waitlist = Array.isArray(waitlistData) ? waitlistData : [];

  // The competition the "Promote Next" action will target. When the tournament
  // owns more than one competition the operator MUST choose — the server rejects
  // an ambiguous promotion rather than filling an arbitrary category.
  const [promoteCompetition, setPromoteCompetition] = useState<number | ''>('');

  const { data: replacementData, isError: replacementError, refetch: refetchReplacement } = useQuery({
    queryKey: ['tournament-replacement-requests', tournamentId],
    queryFn: () => wrap(api.listReplacementRequests, tournamentId),
  });
  const replacementRequests = Array.isArray(replacementData) ? replacementData : [];

  const withdraw = useMutation({
    mutationFn: (participantId: number) => wrap(api.withdrawParticipant, tournamentId, participantId),
    onSuccess: () => { showToast(t('tournaments.participant_withdrawn', 'Participant withdrawn'), 'success'); invalidate(); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const promote = useMutation({
    mutationFn: () => wrap(api.promoteNextWaitlisted, tournamentId, undefined, promoteCompetition === '' ? null : promoteCompetition),
    onSuccess: () => { showToast(t('tournaments.waitlist_promoted', 'Waitlisted participant promoted'), 'success'); invalidate(); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const replace = useMutation({
    mutationFn: () => wrap(api.replaceParticipant, tournamentId, replaceTarget!.withdrawnId, replaceTarget!.replacementId, undefined, replaceTarget!.competitionId ?? null),
    onSuccess: () => { showToast(t('tournaments.participant_replaced', 'Participant replaced'), 'success'); setReplaceTarget(null); invalidate(); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const assignSeed = useMutation({
    mutationFn: () =>
      wrap(api.assignSeed, tournamentId, seedTarget!.participantId, {
        seed_number: Number(seedTarget!.seedNumber),
        source: seedTarget!.source,
        reason: seedTarget!.reason || undefined,
      }),
    onSuccess: () => { showToast(t('tournaments.seed_assigned', 'Seed assigned'), 'success'); setSeedTarget(null); invalidate(); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const generateDraw = useMutation({
    mutationFn: () => wrap(api.generateDraw, tournamentId, undefined, scopedDrawCompetition),
    onSuccess: () => { showToast(t('tournaments.draw_generated', 'Draw generated'), 'success'); invalidate(); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const approveDraw = useMutation({
    mutationFn: () => wrap(api.approveDraw, tournamentId, scopedDrawCompetition),
    onSuccess: () => { showToast(t('tournaments.draw_approved', 'Draw approved'), 'success'); invalidate(); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const lockDraw = useMutation({
    mutationFn: () => wrap(api.lockDraw, tournamentId, scopedDrawCompetition),
    onSuccess: () => { showToast(t('tournaments.draw_locked', 'Draw locked'), 'success'); invalidate(); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  // ── Group 7 mutations ──

  const createPairTeam = useMutation({
    mutationFn: () => {
      const type = createTarget!.type;
      // B4 — the REAL user ids chosen in the picker + the selected competition,
      // sent through the EXISTING request contract (the server stays authoritative
      // for eligibility, roster size, duplicates and tenant/competition scope).
      const payload = {
        name: createPairTeamName || undefined,
        member_user_ids: selectedMemberIds,
        competition_id: pairCompetitionId ?? undefined,
      };
      return type === 'team'
        ? wrap(api.createTeamParticipant, tournamentId, payload)
        : wrap(api.createPairParticipant, tournamentId, payload);
    },
    onSuccess: () => { showToast(t('tournaments.participant_created', 'Participant created'), 'success'); setCreateTarget(null); setCreatePairTeamName(''); setSelectedMemberIds([]); setMemberSearch(''); invalidate(); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const addMember = useMutation({
    mutationFn: () => wrap(api.addParticipantMember, tournamentId, addMemberTarget!.participantId, Number(addMemberUserId)),
    onSuccess: () => { showToast(t('tournaments.member_added', 'Member added'), 'success'); setAddMemberTarget(null); setAddMemberUserId(''); invalidate(); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const removeMember = useMutation({
    mutationFn: ({ participantId, userId }: { participantId: number; userId: number }) => wrap(api.removeParticipantMember, tournamentId, participantId, userId),
    onSuccess: () => { showToast(t('tournaments.member_removed', 'Member removed'), 'success'); invalidate(); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const requestReplacement = useMutation({
    mutationFn: () => wrap(api.createReplacementRequest, tournamentId, requestTarget!.participantId, {
      outgoing_user_id: Number(requestOutgoingUserId),
      replacement_user_id: Number(requestReplacementUserId),
      reason: requestReason || undefined,
    }),
    onSuccess: () => { showToast(t('tournaments.replacement_requested', 'Replacement request submitted'), 'success'); setRequestTarget(null); setRequestOutgoingUserId(''); setRequestReplacementUserId(''); setRequestReason(''); invalidate(); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const approveReplacement = useMutation({
    mutationFn: (requestId: number) => wrap(api.approveReplacementRequest, tournamentId, requestId),
    onSuccess: () => { showToast(t('tournaments.replacement_approved', 'Replacement approved'), 'success'); invalidate(); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const rejectReplacement = useMutation({
    mutationFn: (requestId: number) => wrap(api.rejectReplacementRequest, tournamentId, requestId),
    onSuccess: () => { showToast(t('tournaments.replacement_rejected', 'Replacement rejected'), 'success'); invalidate(); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const cancelReplacement = useMutation({
    mutationFn: (requestId: number) => wrap(api.cancelReplacementRequest, tournamentId, requestId),
    onSuccess: () => { showToast(t('tournaments.replacement_cancelled', 'Replacement cancelled'), 'success'); invalidate(); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const [createPairTeamName, setCreatePairTeamName] = useState('');
  const [addMemberUserId, setAddMemberUserId] = useState('');
  const [requestOutgoingUserId, setRequestOutgoingUserId] = useState('');
  const [requestReplacementUserId, setRequestReplacementUserId] = useState('');
  const [requestReason, setRequestReason] = useState('');

  if (isLoading) return <div className="p-6"><SkeletonRow count={4} /></div>;

  const drawStatus = draw?.status ?? '—';
  const drawEntries = Array.isArray(draw?.entries) ? draw.entries : [];

  const managePerm = isOrg && orgId ? 'org.tournaments.manage' : 'tournament.manage';

  const memberList = (p: any): Member[] => (Array.isArray(p?.members) ? p.members.filter((m: any) => m.status === 'active') : []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--color-text)]">{t('tournaments.participants', 'Participants & Seeding')}</h1>
        <div className="flex gap-2 flex-wrap items-center">
          {needsCompetitionChoice && (
            <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
              {t('tournaments.draw.competition', 'Competition')}
              <select
                aria-label={t('tournaments.draw.competition', 'Competition')}
                value={drawCompetition}
                onChange={(e) => setDrawCompetition(e.target.value ? Number(e.target.value) : '')}
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-2 py-1 text-xs bg-[var(--color-surface)] text-[var(--color-text)]"
              >
                <option value="">{t('tournaments.competition.select', 'Select competition…')}</option>
                {competitionList.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name || `#${c.id}`}</option>
                ))}
              </select>
            </label>
          )}
          <Can permission={managePerm}>
            <button onClick={() => navigate(isOrg ? `/org/${orgId}/tournaments/${tournamentId}/draw` : `/admin/tournament/list/${tournamentId}/draw`)}
              className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)]">
              {t('tournaments.draw', 'Draw')}
            </button>
            <button onClick={() => navigate(isOrg ? `/org/${orgId}/tournaments/${tournamentId}/schedule` : `/admin/tournament/list/${tournamentId}/schedule`)}
              className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)]">
              {t('tournaments.matches_schedule', 'Matches & Schedule')}
            </button>
            <button onClick={() => setCreateTarget({ type: 'pair' })}
              className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white">
              {t('tournaments.create_pair', 'Add Pair')}
            </button>
            <button onClick={() => setCreateTarget({ type: 'team' })}
              className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] border border-[var(--color-primary)] text-[var(--color-primary)]">
              {t('tournaments.create_team', 'Add Team')}
            </button>
            <button onClick={() => generateDraw.mutate()} disabled={missingDrawCompetitionChoice || generateDraw.isPending || drawStatus === 'locked' || drawError}
              className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white disabled:opacity-50">
              {draw ? 'Re-Draw' : 'Generate Draw'}
            </button>
            <button onClick={() => approveDraw.mutate()} disabled={missingDrawCompetitionChoice || approveDraw.isPending || drawStatus !== 'draft'}
              className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] border border-green-300 text-green-700 disabled:opacity-50">
              Approve
            </button>
            <button onClick={() => lockDraw.mutate()} disabled={missingDrawCompetitionChoice || lockDraw.isPending || drawStatus !== 'approved'}
              className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] border border-amber-300 text-amber-700 disabled:opacity-50">
              Lock
            </button>
          </Can>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 text-sm">
        {drawError ? (
          <>
            <span className="text-[var(--color-error)]">Unable to load draw.</span>{' '}
            <button onClick={() => refetchDraw()} className="underline">{t('common.retry', 'Retry')}</button>
          </>
        ) : (
          <>
            <span className="text-[var(--color-text-muted)]">Draw status:</span>{' '}
            <span className="font-semibold capitalize">{drawStatus}</span>
            {draw?.attempt_number ? <span className="text-[var(--color-text-muted)]"> • attempt #{draw.attempt_number}</span> : null}
          </>
        )}
      </div>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-x-auto">
        {participantsError ? (
          <div className="p-5">
            <p className="text-sm text-[var(--color-error)]">Unable to load participants.</p>
            <button onClick={() => refetchParticipants()}
              className="mt-3 text-sm font-medium text-[var(--color-primary)] underline">
              {t('common.retry', 'Retry')}
            </button>
          </div>
        ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-[var(--color-text-muted)]">
              <th className="text-left px-4 py-3">Participant</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Members</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Global Rating</th>
              <th className="text-left px-4 py-3">Tournament Seed</th>
              <th className="text-left px-4 py-3">Source</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p: any) => {
              const members = memberList(p);
              const isMulti = p.participant_type === 'pair' || p.participant_type === 'team';
              return (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-4 py-2 font-medium">{p.name || p.display_name || `Player #${p.player_id}`}</td>
                  <td className="px-4 py-2 capitalize">{p.participant_type || 'individual'}</td>
                  <td className="px-4 py-2">
                    {!isMulti ? (
                      <span>{members[0]?.full_name || p.display_name || `Player #${p.player_id}`}</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {members.map((m) => (
                          <li key={m.user_id} className="flex items-center gap-2">
                            <span>{m.full_name || `Player #${m.user_id}`}</span>
                            {p.status === 'active' && (
                              <Can permission={managePerm}>
                                <button onClick={() => { if (window.confirm('Remove this member?')) removeMember.mutate({ participantId: p.id, userId: m.user_id }); }}
                                  className="text-[10px] text-[var(--color-error)] hover:underline">
                                  Remove
                                </button>
                              </Can>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-2 capitalize">{p.status || 'active'}</td>
                  <td className="px-4 py-2">{p.global_rating != null ? `${p.global_rating}%` : '—'}</td>
                  <td className="px-4 py-2 font-semibold">{p.seed ? `#${p.seed.seed_number}` : '—'}</td>
                  <td className="px-4 py-2 capitalize">{p.seed ? p.seed.source : '—'}</td>
                  <td className="px-4 py-2 text-right space-x-2">
                    <Can permission={managePerm}>
                      <button onClick={() => setSeedTarget({ participantId: p.id, seedNumber: p.seed?.seed_number ?? '', source: p.seed?.source ?? 'manual', reason: '' })}
                        className="text-xs text-[var(--color-primary)] hover:underline">
                        {p.seed ? 'Change Seed' : 'Assign Seed'}
                      </button>
                      {isMulti && p.status === 'active' && (
                        <>
                          <button onClick={() => setAddMemberTarget({ participantId: p.id })}
                            className="text-xs text-[var(--color-primary)] hover:underline">
                            Add Member
                          </button>
                          <button onClick={() => setRequestTarget({ participantId: p.id, members })}
                            className="text-xs text-[var(--color-primary)] hover:underline">
                            Request Replacement
                          </button>
                        </>
                      )}
                      {p.status === 'active' && (
                        <button onClick={() => { if (window.confirm('Withdraw this participant before the tournament start?')) withdraw.mutate(p.id); }}
                          className="text-xs text-[var(--color-error)] hover:underline">
                          Withdraw
                        </button>
                      )}
                      {/* G11.20 — the replacement must come from the SAME competition as the withdrawn
                          participant, so the candidate list is filtered to that competition
                          (the server enforces this too and never trusts the client id). */}
                      {p.status === 'withdrawn' && (() => {
                        const candidates = waitlist.filter((w: any) =>
                          competitionList.length <= 1 || w.competition_id == null || p.competition_id == null
                            ? true
                            : Number(w.competition_id) === Number(p.competition_id));
                        return candidates.length > 0 ? (
                          <button onClick={() => setReplaceTarget({ withdrawnId: p.id, replacementId: candidates[0].id, competitionId: candidates[0].competition_id ?? p.competition_id ?? null })}
                            className="text-xs text-[var(--color-primary)] hover:underline">
                            Replace
                          </button>
                        ) : null;
                      })()}
                    </Can>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        )}
      </div>

      {/* Group 7 — pending replacement requests */}
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-hidden">
        <div className="flex items-center justify-between p-4">
          <h2 className="text-sm font-semibold">{t('tournaments.replacement_requests', 'Replacement Requests')} ({replacementRequests.length})</h2>
          <p className="text-[11px] text-[var(--color-text-muted)]">{t('tournaments.replacement_seed_hint', 'Replacing a member does not change the team\'s/pair\'s Tournament Seed.')}</p>
        </div>
        {replacementError ? (
          <div className="px-4 pb-4">
            <p className="text-xs text-[var(--color-error)]">Unable to load replacement requests.</p>
            <button onClick={() => refetchReplacement()}
              className="mt-2 text-xs font-medium text-[var(--color-primary)] underline">
              {t('common.retry', 'Retry')}
            </button>
          </div>
        ) : replacementRequests.length === 0 ? (
          <p className="px-4 pb-4 text-xs text-[var(--color-text-muted)]">{t('tournaments.replacement_requests_empty', 'No replacement requests.')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-xs text-[var(--color-text-muted)]">
                <th className="text-left px-4 py-3">Team/Pair</th>
                <th className="text-left px-4 py-3">Current Player</th>
                <th className="text-left px-4 py-3">Proposed Player</th>
                <th className="text-left px-4 py-3">Requester</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Draw Impact</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr></thead>
              <tbody>
                {replacementRequests.map((rq: any) => (
                  <tr key={rq.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{rq.participant_name || `Participant #${rq.participant_id}`}</td>
                    <td className="px-4 py-2">{rq.outgoing_member_name || `Player #${rq.outgoing_member_user_id}`}</td>
                    <td className="px-4 py-2">{rq.replacement_user_name || `Player #${rq.replacement_user_id}`}</td>
                    <td className="px-4 py-2">{rq.requested_by_name || `#${rq.requested_by}`}</td>
                    <td className="px-4 py-2">{rq.requested_at ? new Date(rq.requested_at).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-2 capitalize">{rq.status}</td>
                    <td className="px-4 py-2 text-[11px]">
                      {rq.status === 'pending' ? (
                        <span className="text-[var(--color-text-muted)]">{t('tournaments.replacement_draw_impact_hint', 'Seed + draw preserved; validation only.')}</span>
                      ) : (rq.rejection_reason ? `Rejected: ${rq.rejection_reason}` : '—')}
                    </td>
                    <td className="px-4 py-2 text-right space-x-2">
                      <Can permission={managePerm}>
                        {rq.status === 'pending' && (
                          <>
                            <button onClick={() => approveReplacement.mutate(rq.id)} disabled={approveReplacement.isPending}
                              className="text-xs text-green-600 hover:underline disabled:opacity-50">
                              Approve
                            </button>
                            <button onClick={() => { if (window.confirm('Reject this replacement request?')) rejectReplacement.mutate(rq.id); }}
                              className="text-xs text-[var(--color-error)] hover:underline">
                              Reject
                            </button>
                            <button onClick={() => { if (window.confirm('Cancel this replacement request?')) cancelReplacement.mutate(rq.id); }}
                              className="text-xs text-[var(--color-text-muted)] hover:underline">
                              Cancel
                            </button>
                          </>
                        )}
                      </Can>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Group 6 — FIFO waitlist (G11.20: competition-scoped) */}
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <h2 className="text-sm font-semibold">{t('tournaments.waitlist', 'Waitlist')} ({waitlist.length})</h2>
          <div className="flex flex-wrap items-center gap-2">
            {/* Filter the waitlist to a single competition category. */}
            {competitionList.length > 1 && (
              <select
                aria-label={t('tournaments.competition.filter', 'Filter by competition')}
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-text)]"
                value={waitlistCompetition}
                onChange={(e) => setWaitlistCompetition(e.target.value === '' ? '' : Number(e.target.value))}
              >
                <option value="">{t('tournaments.competition.all', 'All competitions')}</option>
                {competitionList.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            <Can permission={managePerm}>
              <button
                onClick={() => promote.mutate()}
                // G11.20 — with several categories the operator must pick the target
                // competition first; the server would reject an ambiguous promotion.
                disabled={promote.isPending || waitlist.length === 0 || (needsCompetitionChoice && promoteCompetition === '')}
                title={needsCompetitionChoice && promoteCompetition === ''
                  ? t('tournaments.competition.pick_first', 'Select the competition to promote into')
                  : undefined}
                className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white disabled:opacity-50">
                {t('tournaments.promote_next', 'Promote Next')}
              </button>
            </Can>
          </div>
        </div>
        {competitionsError && (
          <div className="px-4 pb-3 flex items-center justify-between gap-2">
            <p className="text-xs text-[var(--color-error)]">Unable to load competitions.</p>
            <button onClick={() => refetchCompetitions()}
              className="text-xs font-medium text-[var(--color-primary)] underline">
              {t('common.retry', 'Retry')}
            </button>
          </div>
        )}
        {/* Explicit competition target for the promotion. */}
        {needsCompetitionChoice && (
          <div className="px-4 pb-3">
            <label className="text-[11px] text-[var(--color-text-muted)] mr-2" htmlFor="promote-competition">
              {t('tournaments.competition.promote_into', 'Promote into')}
            </label>
            <select
              id="promote-competition"
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-text)]"
              value={promoteCompetition}
              onChange={(e) => setPromoteCompetition(e.target.value === '' ? '' : Number(e.target.value))}
            >
              <option value="">{t('tournaments.competition.select', 'Select competition…')}</option>
              {competitionList.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
        {waitlistError ? (
          <div className="px-4 pb-4">
            <p className="text-xs text-[var(--color-error)]">Unable to load waitlist.</p>
            <button onClick={() => refetchWaitlist()}
              className="mt-2 text-xs font-medium text-[var(--color-primary)] underline">
              {t('common.retry', 'Retry')}
            </button>
          </div>
        ) : waitlist.length === 0 ? (
          <p className="px-4 pb-4 text-xs text-[var(--color-text-muted)]">{t('tournaments.waitlist_empty', 'The waitlist is empty.')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b text-xs text-[var(--color-text-muted)]">
              <th className="text-left px-4 py-3">Order</th><th className="text-left px-4 py-3">Participant</th>
              {/* G11.20 — competition context per waiting entry */}
              {competitionList.length > 1 && <th className="text-left px-4 py-3">{t('tournaments.competition.column', 'Competition')}</th>}
              <th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Payment</th>
            </tr></thead>
            <tbody>
              {waitlist.map((w: any) => (
                <tr key={w.id} className="border-b last:border-0">
                  <td className="px-4 py-2 font-bold">#{w.waiting_order ?? w.id}</td>
                  <td className="px-4 py-2">{w.display_name || `Player #${w.player_id}`}</td>
                  {competitionList.length > 1 && (
                    <td className="px-4 py-2">
                      <span className="rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] uppercase text-[var(--color-text-muted)]">
                        {w.competition_name ?? (w.competition_id != null ? `#${w.competition_id}` : '—')}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-2 capitalize">{w.status}</td>
                  <td className="px-4 py-2">unpaid</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!drawError && drawEntries.length > 0 && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-x-auto">
          <h2 className="text-sm font-semibold p-4 pb-0">{t('tournaments.draw_positions', 'Draw Positions')}</h2>
          <table className="w-full text-sm mt-2">
            <thead><tr className="border-b text-xs text-[var(--color-text-muted)]">
              <th className="text-left px-4 py-3">#</th><th className="text-left px-4 py-3">Participant</th><th className="text-left px-4 py-3">Seed</th><th className="text-left px-4 py-3">Placement</th>
            </tr></thead>
            <tbody>
              {drawEntries.map((e: any) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="px-4 py-2 font-bold">{e.position}</td>
                  <td className="px-4 py-2">{e.display_name || `Participant #${e.participant_id}`}</td>
                  <td className="px-4 py-2">{e.seed_number != null ? `#${e.seed_number}` : '—'}</td>
                  <td className="px-4 py-2 capitalize">{e.placement_source}{e.overridden ? ' (overridden)' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {replaceTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setReplaceTarget(null)}>
          <div className="w-full max-w-sm bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold">{t('tournaments.replace_participant', 'Replace Participant')}</h3>
            <p className="text-xs text-[var(--color-text-muted)]">{t('tournaments.replace_hint', 'The withdrawn participant\'s seed is preserved; the replacement receives a new participant identity and no seed is transferred automatically.')}</p>
            <label className="block text-xs font-medium text-[var(--color-text-muted)]">Replacement (waitlist)</label>
            <select value={replaceTarget.replacementId} onChange={(e) => setReplaceTarget({ ...replaceTarget, replacementId: Number(e.target.value) })}
              className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm">
              {waitlist.map((w: any) => (
                <option key={w.id} value={w.id}>#{w.waiting_order ?? w.id} — {w.display_name || `Player #${w.player_id}`}</option>
              ))}
            </select>
            <button onClick={() => replace.mutate()} disabled={replace.isPending}
              className="w-full px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium">
              {replace.isPending ? 'Replacing...' : 'Replace Participant'}
            </button>
          </div>
        </div>
      )}

      {seedTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setSeedTarget(null)}>
          <div className="w-full max-w-sm bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold">{t('tournaments.assign_seed', 'Assign Tournament Seed')}</h3>
            <p className="text-xs text-[var(--color-text-muted)]">{t('tournaments.manual_seed_hint', 'Manual seed applies only to this tournament and does not change the player\'s global rating.')}</p>
            <input type="number" min={1} value={seedTarget.seedNumber} onChange={(e) => setSeedTarget({ ...seedTarget, seedNumber: e.target.value })}
              placeholder="Seed #" className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm" />
            <select value={seedTarget.source} onChange={(e) => setSeedTarget({ ...seedTarget, source: e.target.value as 'rating' | 'manual' })}
              className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm">
              <option value="manual">Manual</option>
              <option value="rating">Rating</option>
            </select>
            <input value={seedTarget.reason} onChange={(e) => setSeedTarget({ ...seedTarget, reason: e.target.value })}
              placeholder="Reason (optional)" className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm" />
            <button onClick={() => assignSeed.mutate()} disabled={assignSeed.isPending || !seedTarget.seedNumber}
              className="w-full px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50">
              {assignSeed.isPending ? 'Saving...' : 'Assign Seed'}
            </button>
          </div>
        </div>
      )}

      {/* Group 7 — create pair/team */}
      {createTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setCreateTarget(null)}>
          <div className="w-full max-w-md bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold">{createTarget.type === 'pair' ? t('tournaments.create_pair', 'Add Pair') : t('tournaments.create_team', 'Add Team')}</h3>
            <p className="text-xs text-[var(--color-text-muted)]">{t('tournaments.pair_members_hint', 'Select registered players by name. One tournament entry — one payment. The sport/format roster size is enforced server-side.')}</p>
            <label className="block text-xs font-medium text-[var(--color-text-muted)]">Name</label>
            <input value={createPairTeamName} onChange={(e) => setCreatePairTeamName(e.target.value)}
              placeholder={createTarget.type === 'pair' ? 'Pair name' : 'Team name'} className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm" />

            {competitionList.length > 1 && (
              <div>
                <label htmlFor="pair-competition" className="block text-xs font-medium text-[var(--color-text-muted)]">
                  {t('tournaments.pair_select_competition', 'Competition')}
                </label>
                <select id="pair-competition" value={pairCompetition}
                  onChange={(e) => setPairCompetition(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm">
                  <option value="">{t('tournaments.pair_select_competition_placeholder', 'Select a competition…')}</option>
                  {competitionList.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name || `Competition #${c.id}`}</option>
                  ))}
                </select>
              </div>
            )}

            <label htmlFor="pair-member-search" className="block text-xs font-medium text-[var(--color-text-muted)]">
              {t('tournaments.pair_search_players', 'Players (search by name)')}
            </label>
            <input id="pair-member-search" type="search" value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder={t('tournaments.pair_search_placeholder', 'Search registered players by name')}
              className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm" />

            <ul aria-label={t('tournaments.pair_available_players', 'Registered players')}
              className="max-h-40 overflow-y-auto divide-y rounded-[var(--radius-md)] border border-[var(--color-border)]">
              {visibleCandidates.length === 0 && (
                <li className="px-3 py-2 text-xs text-[var(--color-text-muted)]">
                  {t('tournaments.pair_no_players', 'No registered players match.')}
                </li>
              )}
              {visibleCandidates.map((c) => {
                const isSelected = selectedMemberIds.includes(c.id);
                const disabled = Boolean(c.unavailableReason) || isSelected;
                return (
                  <li key={c.id}>
                    <button type="button" disabled={disabled}
                      onClick={() => setSelectedMemberIds((prev) => (prev.includes(c.id) ? prev : [...prev, c.id]))}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm disabled:opacity-60">
                      <span>{c.name}</span>
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {c.unavailableReason ?? (isSelected ? t('tournaments.pair_selected', 'Selected') : t('tournaments.pair_add', 'Add'))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div aria-label={t('tournaments.pair_selected_players', 'Selected players')} className="flex flex-wrap gap-2">
              {selectedPlayers.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-[var(--color-bg)] px-2 py-1 text-xs">
                  {p.name}
                  <button type="button" aria-label={t('tournaments.pair_remove_player', 'Remove player')}
                    onClick={() => setSelectedMemberIds((prev) => prev.filter((id) => id !== p.id))}>×</button>
                </span>
              ))}
            </div>

            {needsPairCompetitionChoice && (
              <p role="alert" className="text-xs text-[var(--color-error)]">
                {t('tournaments.pair_competition_required', 'Select a competition before creating a pair.')}
              </p>
            )}

            <button onClick={() => createPairTeam.mutate()}
              disabled={createPairTeam.isPending || !pairScopeResolved || selectedMemberIds.length < 2}
              className="w-full px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50">
              {createPairTeam.isPending ? 'Saving...' : 'Create Participant'}
            </button>
          </div>
        </div>
      )}

      {/* Group 7 — add member */}
      {addMemberTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setAddMemberTarget(null)}>
          <div className="w-full max-w-sm bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold">{t('tournaments.add_member', 'Add Member')}</h3>
            <label className="block text-xs font-medium text-[var(--color-text-muted)]">Player user ID</label>
            <input type="number" value={addMemberUserId} onChange={(e) => setAddMemberUserId(e.target.value)}
              placeholder="Player user ID" className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm" />
            <button onClick={() => addMember.mutate()} disabled={addMember.isPending || !addMemberUserId}
              className="w-full px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50">
              {addMember.isPending ? 'Adding...' : 'Add Member'}
            </button>
          </div>
        </div>
      )}

      {/* Group 7 — request replacement */}
      {requestTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setRequestTarget(null)}>
          <div className="w-full max-w-md bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold">{t('tournaments.request_replacement', 'Request Player Replacement')}</h3>
            <p className="text-xs text-[var(--color-text-muted)]">{t('tournaments.replacement_seed_hint', 'Replacing a member does not change the team\'s/pair\'s Tournament Seed.')}</p>
            <label className="block text-xs font-medium text-[var(--color-text-muted)]">Current player</label>
            <select value={requestOutgoingUserId} onChange={(e) => setRequestOutgoingUserId(e.target.value)}
              className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm">
              <option value="">Select current member</option>
              {requestTarget.members.map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.full_name || `Player #${m.user_id}`}</option>
              ))}
            </select>
            <label className="block text-xs font-medium text-[var(--color-text-muted)]">Proposed replacement (user ID)</label>
            <input type="number" value={requestReplacementUserId} onChange={(e) => setRequestReplacementUserId(e.target.value)}
              placeholder="Replacement player user ID" className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm" />
            <label className="block text-xs font-medium text-[var(--color-text-muted)]">Reason</label>
            <textarea value={requestReason} onChange={(e) => setRequestReason(e.target.value)} rows={2}
              placeholder="Reason (optional)" className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm" />
            <button onClick={() => requestReplacement.mutate()} disabled={requestReplacement.isPending || !requestOutgoingUserId || !requestReplacementUserId}
              className="w-full px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50">
              {requestReplacement.isPending ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
