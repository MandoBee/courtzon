import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../../../i18n';
import { useToast } from '../../ui/Toast';
import { Can } from '../../../permissions/Can';
import { getErrorMessage } from '../../../utils/errors';
import { SkeletonRow } from '../../ui/Skeleton';
import { Modal } from '../../ui/Modal';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import {
  tournamentApi,
  orgTournamentApi,
  tournamentParticipantApi,
  orgTournamentParticipantApi,
} from '../../../services/tournament';
import { fetchMatchResult, acceptMatchResult } from '../../../services/match-result.api';
import type { TournamentMatchNode } from '../../../types/tournamentBracket';
import { emptyResultForm, buildResultPayload, type ResultForm } from '../../../utils/tournamentResult';

/**
 * Tournament Hub → Matches — the canonical tournament-specific match-management
 * section (Step 3C).
 *
 * DATA SOURCE: the canonical contract from Step 3B
 * (GET /admin/tournaments/:id/matches / org mirror), fed as a prop from the Hub
 * query — ONE fetch drives every segment; no per-segment requests, no second
 * fetching implementation. Additive fields consumed:
 *   stage_name / stage_order / stage_progression_format / group_name /
 *   result_id / result_status.
 *
 * SEGMENT MAPPING (from actual status/result fields — documented, not invented):
 *   all       → every match
 *   upcoming  → status === 'scheduled'
 *   live      → status === 'in_progress' OR shared_status === 'in_progress'
 *   completed → status ∈ {completed, walkover, forfeit, no_show}
 *   results   → result_status ∈ {pending_confirmation, disputed, no_result}
 *               (matches needing result attention)
 *
 * ACTIONS reuse the EXISTING tournament APIs and stay gated by the exact
 * backend permissions (manage / result.manage). The backend is authoritative.
 */

export type MatchSegment = 'all' | 'upcoming' | 'live' | 'completed' | 'results';

interface MatchesManagerProps {
  tournamentId: number;
  isOrg: boolean;
  orgId?: string;
  matches: TournamentMatchNode[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onDetails: (m: TournamentMatchNode) => void;
  onSchedule: () => void;
  onOpenResults: () => void;
  onOpenMonitoring: () => void;
  /** Shows the universal drawer with a shared result record (Step 3F). */
  onViewResult?: (m: TournamentMatchNode, record: unknown) => void;
}

export type ResultFilter = 'attention' | 'approved' | 'disputed' | 'withdrawn' | 'no_result' | 'all';

const STATUS_TONE: Record<string, 'success' | 'warning' | 'info' | 'default'> = {
  scheduled: 'info',
  in_progress: 'warning',
  completed: 'success',
  walkover: 'success',
  forfeit: 'warning',
  no_show: 'warning',
  cancelled: 'default',
};

const RESULT_TONE: Record<string, 'success' | 'warning' | 'default'> = {
  approved: 'success',
  pending_confirmation: 'warning',
  disputed: 'warning',
  no_result: 'default',
  withdrawn: 'default',
};

const TERMINAL_STATUSES = new Set(['completed', 'walkover', 'forfeit', 'no_show']);

function isInProgress(m: TournamentMatchNode): boolean {
  return m.status === 'in_progress' || m.shared_status === 'in_progress';
}

const labelCls = 'mb-1 block text-xs font-medium text-[var(--color-text-muted)]';
const inputCls =
  'min-h-[44px] w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-[var(--color-primary)]';

export function MatchesManager({
  tournamentId,
  isOrg,
  orgId,
  matches,
  loading,
  error,
  onRetry,
  onDetails,
  onSchedule,
  onOpenResults,
  onOpenMonitoring,
  onViewResult,
}: MatchesManagerProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const qc = useQueryClient();

  const [segment, setSegment] = useState<MatchSegment>('all');
  const [stageFilter, setStageFilter] = useState('');
  const [resultModal, setResultModal] = useState<{ match: TournamentMatchNode; open: boolean }>({ match: null as never, open: false });
  const [resultData, setResultData] = useState<ResultForm>(emptyResultForm());
  const [courtFor, setCourtFor] = useState<{ matchId: number; resourceId: string; open: boolean }>({ matchId: 0, resourceId: '', open: false });
  const [refereeFor, setRefereeFor] = useState<{ matchId: number; refereeId: string; open: boolean }>({ matchId: 0, refereeId: '', open: false });
  const [resultFilter, setResultFilter] = useState<ResultFilter>('attention');
  const [viewReq, setViewReq] = useState<{ m: TournamentMatchNode } | null>(null);

  const api = isOrg && orgId ? orgTournamentApi : tournamentApi;
  const pApi = isOrg && orgId ? orgTournamentParticipantApi : tournamentParticipantApi;
  const call = (fn: (...a: any[]) => any, ...a: any[]) => (isOrg && orgId ? fn(orgId, ...a) : fn(...a));
  const prefix = isOrg ? `org-${orgId}-tournament` : 'tournament';
  const managePerm = isOrg ? 'org.tournaments.manage' : 'tournament.manage';
  const resultPerm = isOrg ? 'org.tournaments.result.manage' : 'tournament.result.manage';

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [`${prefix}-matches`, tournamentId] });
    qc.invalidateQueries({ queryKey: [`${prefix}-standings`, tournamentId] });
    qc.invalidateQueries({ queryKey: ['tournament', tournamentId, 'matches'] });
    qc.invalidateQueries({ queryKey: ['tournament', tournamentId, 'standings'] });
    qc.invalidateQueries({ queryKey: ['tournament', tournamentId, 'bracket'] });
  };

  // Court picker source — the SAME eligible-courts endpoint the schedule page uses.
  const { data: courts } = useQuery({
    queryKey: ['tournament-courts', tournamentId],
    queryFn: () => call(pApi.getEligibleCourts, tournamentId),
    enabled: Boolean(courtFor.open),
  });
  const courtOptions: Array<{ id: number; name: string }> = Array.isArray(courts) ? courts : [];

  const segmentMatches = useMemo(() => {
    return matches.filter((m) => {
      if (segment === 'upcoming') return m.status === 'scheduled';
      if (segment === 'live') return isInProgress(m);
      if (segment === 'completed') return TERMINAL_STATUSES.has(String(m.status ?? ''));
      // Results = any match that carries a shared result (submitted state).
      if (segment === 'results') return m.result_status != null;
      return true;
    });
  }, [matches, segment]);

  const stageOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of matches) if (m.stage_name) set.add(m.stage_name);
    return [...set];
  }, [matches]);

  const visible = useMemo(
    () => segmentMatches.filter((m) => !stageFilter || (m.stage_name ?? '') === stageFilter),
    [segmentMatches, stageFilter],
  );

  // Result sub-filter inside the Results segment (client-side, canonical data only).
  const resultVisible = useMemo(() => {
    if (segment !== 'results') return visible;
    return visible.filter((m) => {
      const rs = String(m.result_status ?? '');
      if (resultFilter === 'attention') return rs === 'pending_confirmation' || rs === 'disputed';
      if (resultFilter === 'approved') return rs === 'approved';
      if (resultFilter === 'disputed') return rs === 'disputed';
      if (resultFilter === 'withdrawn') return rs === 'withdrawn';
      if (resultFilter === 'no_result') return rs === 'no_result';
      return true; // all
    });
  }, [segment, visible, resultFilter]);

  const startMatch = useMutation({
    mutationFn: (matchId: number) => call(api.startMatch, matchId),
    onSuccess: () => { invalidate(); showToast(t('tournaments.match_started', 'Match started'), 'success'); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });
  const completeMatch = useMutation({
    mutationFn: (matchId: number) => call(api.completeMatch, matchId),
    onSuccess: () => { invalidate(); showToast(t('tournaments.match_completed', 'Match completed'), 'success'); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });
  const assignCourt = useMutation({
    mutationFn: (args: { matchId: number; resourceId: number }) => call(api.assignCourt, args.matchId, args.resourceId),
    onSuccess: () => { invalidate(); setCourtFor({ matchId: 0, resourceId: '', open: false }); showToast(t('tournaments.court_assigned', 'Court assigned'), 'success'); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });
  const assignReferee = useMutation({
    mutationFn: (args: { matchId: number; refereeId: number }) => call(api.assignReferee, args.matchId, args.refereeId),
    onSuccess: () => { invalidate(); setRefereeFor({ matchId: 0, refereeId: '', open: false }); showToast(t('tournaments.referee_assigned', 'Referee assigned'), 'success'); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });
  const recordResult = useMutation({
    mutationFn: (payload: any) => call(api.recordResult, resultModal.match?.id, payload),
    onSuccess: () => {
      invalidate();
      setResultModal({ match: null as never, open: false });
      setResultData(emptyResultForm());
      showToast(t('tournaments.result_recorded', 'Result recorded'), 'success');
    },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  // Step 3F — accept a pending result through the canonical shared endpoint.
  const acceptResult = useMutation({
    mutationFn: (matchId: number) => acceptMatchResult(matchId),
    onSuccess: () => {
      invalidate();
      showToast(t('tournaments.matchessection.result_accepted', 'Result accepted'), 'success');
    },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  // Step 3F — lazy fetch of the shared result record so the universal Drawer
  // can reuse ResultSummaryView (no second summary implementation).
  const viewResultFetch = useQuery({
    queryKey: ['match-result-lazy', viewReq?.m?.match_id],
    queryFn: () => fetchMatchResult(Number(viewReq?.m?.match_id)),
    enabled: Boolean(viewReq?.m?.match_id),
    retry: false,
  });
  useEffect(() => {
    if (viewReq && viewResultFetch.data) {
      onViewResult?.(viewReq.m, viewResultFetch.data);
      setViewReq(null);
    }
  }, [viewReq, viewResultFetch.data, onViewResult]);

  const selectedMatch = resultModal.open ? resultModal.match : null;
  const saveResult = () => {
    if (!selectedMatch) return;
    const ruleSnap = selectedMatch.rule_snapshot as unknown
      ? (typeof (selectedMatch as any).rule_snapshot === 'string' ? JSON.parse((selectedMatch as any).rule_snapshot) : selectedMatch.rule_snapshot)
      : null;
    const scoreStructure = (ruleSnap as any)?.score_structure;
    recordResult.mutate(buildResultPayload(resultData, scoreStructure));
  };

  const segments: Array<{ key: MatchSegment; label: string }> = [
    { key: 'all', label: t('tournaments.matchessection.all', 'All') },
    { key: 'upcoming', label: t('tournaments.matchessection.upcoming', 'Upcoming') },
    { key: 'live', label: t('tournaments.matchessection.live', 'Live') },
    { key: 'completed', label: t('tournaments.matchessection.completed', 'Completed') },
    { key: 'results', label: t('tournaments.matchessection.results', 'Results') },
  ];

  return (
    <div className="space-y-4">
      {/* Segments + contextual links */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('tournaments.matchessection.label', 'Match segments')}>
          {segments.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSegment(s.key)}
              aria-pressed={segment === s.key}
              className={`min-h-[44px] rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                segment === s.key
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-bg)] text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {segment === 'results' && (
            <button type="button" onClick={onOpenResults} className="min-h-[44px] text-xs text-[var(--color-primary)] hover:underline">
              {t('tournaments.matchessection.open_results', 'Open Match Results')}
            </button>
          )}
          {segment === 'live' && (
            <button type="button" onClick={onOpenMonitoring} className="min-h-[44px] text-xs text-[var(--color-primary)] hover:underline">
              {t('tournaments.matchessection.live_monitoring', 'Live Monitoring')}
            </button>
          )}
          {stageOptions.length > 1 && (
            <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
              <span>{t('tournaments.match.stage', 'Stage')}</span>
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs"
              >
                <option value="">{t('tournaments.matchessection.all_stages', 'All stages')}</option>
                {stageOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          )}
        </div>
      </div>

      {/* Results sub-filter (clientside, canonical data only) */}
      {segment === 'results' && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('tournaments.matchessection.result_filter_label', 'Filter results')}>
          {resultFilters(t).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setResultFilter(f.key)}
              aria-pressed={resultFilter === f.key}
              className={`min-h-[44px] rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                resultFilter === f.key
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-bg)] text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} count={1} />)}</div>}

      {/* Error */}
      {!loading && error && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-error)]/40 bg-[var(--color-error-bg)] px-4 py-8 text-center">
          <p className="text-sm text-[var(--color-error)]">{t('tournaments.match.load_error', 'Unable to load matches.')}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
            {t('tournaments.match.retry', 'Retry')}
          </Button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && matches.length === 0 && (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] px-4 py-10 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">{t('tournaments.match.no_matches', 'No matches yet for this tournament.')}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={onSchedule}>
            {t('tournaments.matches_schedule', 'Matches & Schedule')}
          </Button>
        </div>
      )}

      {/* Segmented empty */}
      {!loading && !error && matches.length > 0 && resultVisible.length === 0 && (
        <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
          {segment === 'results'
            ? t('tournaments.matchessection.no_results_yet', 'No results yet for this tournament.')
            : t('tournaments.matchessection.segment_empty', 'No matches in this segment.')}
        </p>
      )}

      {/* Rows */}
      {!loading && !error && resultVisible.map((m) => {
        const live = isInProgress(m);
        const canStart = m.shared_status === 'closed';
        const canPlay = m.shared_status === 'in_progress' || m.shared_status === 'completed';
        const p1 = m.player1_name || m.participant1_name || (m.player1_id != null ? 'Player' : t('tournamentBracket.tbd', 'TBD'));
        const p2 = m.player2_name || m.participant2_name || (m.player2_id != null ? 'Player' : t('tournamentBracket.tbd', 'TBD'));
        const stageLabel = m.stage_name ?? t('tournaments.matchessection.unassigned', 'Unassigned');
        return (
          <div
            key={m.id}
            className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 md:flex md:items-center md:gap-4"
          >
            {/* Context: round / stage / group */}
            <div className="md:w-40 md:shrink-0">
              <p className="text-xs font-medium text-[var(--color-text)]">
                {m.round != null ? `${t('tournaments.match.round', 'Round')} ${m.round}` : '—'}
                {m.is_final ? ` · ${t('tournamentBracket.final', 'Final')}` : ''}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {m.stage_name && (
                  <span className="inline-flex items-center rounded-full border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-text-muted)]">
                    {t('tournaments.match.stage', 'Stage')}: {stageLabel}
                  </span>
                )}
                {m.group_name && (
                  <span className="inline-flex items-center rounded-full border border-[var(--color-primary)]/40 px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-primary)]">
                    {t('tournaments.match.group', 'Group')}: {m.group_name}
                  </span>
                )}
              </div>
            </div>

            {/* Participants + score */}
            <div className="mt-2 md:mt-0 md:flex-1 md:min-w-0">
              <p className="truncate text-sm text-[var(--color-text)]">{p1}</p>
              <p className="my-0.5 truncate font-mono text-xs text-[var(--color-text-muted)]">{m.score_summary || t('tournamentBracket.vs', 'vs')}</p>
              <p className="truncate text-sm text-[var(--color-text)]">{p2}</p>
            </div>

            {/* Schedule / court / referee */}
            <div className="mt-2 space-y-0.5 text-xs text-[var(--color-text-muted)] md:mt-0 md:w-44 md:shrink-0">
              {m.start_time && <p>{formatWhen(m.start_time)}</p>}
              <p>{m.resource_name || '-'}</p>
              <p>{m.referee_name || '-'}</p>
            </div>

            {/* Status + result chip */}
            <div className="mt-2 md:mt-0 md:w-32 md:shrink-0">
              <Badge variant={STATUS_TONE[String(m.status ?? '')] ?? 'default'}>{m.status ?? '—'}</Badge>
              {m.result_status && (
                <Badge variant={RESULT_TONE[m.result_status] ?? 'default'} className="ml-1">{m.result_status}</Badge>
              )}
              {live && (
                <p className="mt-1 text-[10px] font-semibold text-[var(--color-warning-text)]">
                  {t('tournaments.matchessection.live', 'Live')}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="mt-3 flex flex-wrap items-center gap-2 md:mt-0 md:justify-end">
              <Button size="sm" variant="ghost" onClick={() => onDetails(m)}>
                {t('tournamentBracket.details', 'Details')}
              </Button>
              {segment === 'results' && m.match_id != null && m.result_status && (
                <Button size="sm" variant="ghost" onClick={() => setViewReq({ m })}>
                  {t('tournaments.matchessection.view_result', 'View Result')}
                </Button>
              )}
              {segment === 'results' && m.result_status === 'pending_confirmation' && m.match_id != null && (
                <Can permission="matches.result.accept">
                  <Button size="sm" variant="primary" onClick={() => acceptResult.mutate(m.match_id!)}>
                    {t('tournaments.matchessection.accept_result', 'Accept Result')}
                  </Button>
                </Can>
              )}
              <Button size="sm" variant="ghost" onClick={onSchedule}>
                {t('tournaments.matches_schedule', 'Matches & Schedule')}
              </Button>
              <Can permission={managePerm}>
                {canStart && (
                  <Button size="sm" variant="primary" onClick={() => startMatch.mutate(m.id)}>
                    {t('tournaments.start_match', 'Start')}
                  </Button>
                )}
                {canPlay && (
                  <Button size="sm" variant="secondary" onClick={() => completeMatch.mutate(m.id)}>
                    {t('tournaments.complete_match', 'Complete')}
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => setCourtFor((p) => ({ matchId: m.id, resourceId: '', open: !(p.open && p.matchId === m.id) }))}>
                  {t('tournaments.assign_court', 'Court')}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setRefereeFor((p) => ({ matchId: m.id, refereeId: '', open: !(p.open && p.matchId === m.id) }))}>
                  {t('tournaments.assign_referee', 'Referee')}
                </Button>
              </Can>
              <Can permission={resultPerm}>
                <Button size="sm" variant="secondary" onClick={() => { setResultModal({ match: m, open: true }); setResultData(emptyResultForm()); }}>
                  {t('tournaments.record_result', 'Record Result')}
                </Button>
              </Can>
              {courtFor.open && courtFor.matchId === m.id && (
                <div className="flex w-full items-center gap-2 md:w-auto">
                  <select
                    value={courtFor.resourceId}
                    onChange={(e) => setCourtFor((p) => ({ ...p, resourceId: e.target.value }))}
                    className="min-h-[44px] flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs md:w-40"
                    aria-label={t('tournaments.assign_court', 'Assign court')}
                  >
                    <option value="">{t('tournaments.matchessection.select_court', 'Select court…')}</option>
                    {courtOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <Button size="sm" variant="primary" disabled={!courtFor.resourceId || assignCourt.isPending} onClick={() => assignCourt.mutate({ matchId: m.id, resourceId: Number(courtFor.resourceId) })}>
                    {t('tournaments.matchessection.apply', 'Apply')}
                  </Button>
                </div>
              )}
              {refereeFor.open && refereeFor.matchId === m.id && (
                <div className="flex w-full items-center gap-2 md:w-auto">
                  <input
                    type="number"
                    min={0}
                    value={refereeFor.refereeId}
                    onChange={(e) => setRefereeFor((p) => ({ ...p, refereeId: e.target.value }))}
                    className="min-h-[44px] flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs md:w-32"
                    placeholder={t('tournaments.matchessection.referee_id_placeholder', 'Referee ID')}
                    aria-label={t('tournaments.assign_referee', 'Assign referee')}
                  />
                  <Button size="sm" variant="primary" disabled={!refereeFor.refereeId || assignReferee.isPending} onClick={() => assignReferee.mutate({ matchId: m.id, refereeId: Number(refereeFor.refereeId) })}>
                    {t('tournaments.matchessection.apply', 'Apply')}
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Result modal — same flow as the standalone page (shared result API) */}
      <Modal
        open={resultModal.open}
        onClose={() => setResultModal((p) => ({ ...p, open: false }))}
        title={t('tournaments.record_result', 'Record Result')}
        size="sm"
        a11yDialog
      >
        {selectedMatch && (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>{t('tournaments.match.status')}</label>
              <select value={resultData.outcome} onChange={(e) => setResultData((p) => ({ ...p, outcome: e.target.value }))} className={inputCls}>
                <option value="completed">{t('tournaments.match_status.completed')}</option>
                <option value="walkover">{t('tournaments.match_status.walkover')}</option>
                <option value="forfeit">Forfeit</option>
                <option value="retired">Retired</option>
                <option value="abandoned">Abandoned</option>
              </select>
            </div>
            {resultData.outcome !== 'completed' && resultData.outcome !== 'abandoned' && (
              <div>
                <label className={labelCls}>{t('tournaments.match.winner', 'Winner')}</label>
                <select value={resultData.winnerSide} onChange={(e) => setResultData((p) => ({ ...p, winnerSide: e.target.value }))} className={inputCls}>
                  <option value="">{t('tournaments.match.select_winner', 'Select winner')}</option>
                  <option value="home">{selectedMatch.player1_name || 'Player 1'} (Home)</option>
                  <option value="away">{selectedMatch.player2_name || 'Player 2'} (Away)</option>
                </select>
              </div>
            )}
            {resultData.outcome === 'completed' && (() => {
              const ruleSnap = typeof (selectedMatch as any).rule_snapshot === 'string' ? JSON.parse((selectedMatch as any).rule_snapshot) : selectedMatch.rule_snapshot;
              const structure = ruleSnap?.score_structure;
              if (structure === 'goals') {
                return (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelCls}>Home Goals</label>
                      <input type="number" min={0} value={resultData.homeGoals} onChange={(e) => setResultData((p) => ({ ...p, homeGoals: e.target.value }))} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Away Goals</label>
                      <input type="number" min={0} value={resultData.awayGoals} onChange={(e) => setResultData((p) => ({ ...p, awayGoals: e.target.value }))} className={inputCls} />
                    </div>
                  </div>
                );
              }
              return (
                <div className="space-y-1">
                  <label className={labelCls}>{t('tournaments.match.sets', 'Sets')}</label>
                  {resultData.sets.map((s, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input type="number" min={0} value={s.home} placeholder="Home" onChange={(e) => setResultData((p) => ({ ...p, sets: p.sets.map((x, i) => (i === idx ? { ...x, home: e.target.value } : x)) }))} className="flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] px-2 py-1 text-sm" />
                      <span>-</span>
                      <input type="number" min={0} value={s.away} placeholder="Away" onChange={(e) => setResultData((p) => ({ ...p, sets: p.sets.map((x, i) => (i === idx ? { ...x, away: e.target.value } : x)) }))} className="flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] px-2 py-1 text-sm" />
                      <button type="button" onClick={() => setResultData((p) => ({ ...p, sets: p.sets.filter((_, i) => i !== idx) }))} className="text-xs text-[var(--color-error)] px-1" aria-label="Remove set">X</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setResultData((p) => ({ ...p, sets: [...p.sets, { home: '', away: '' }] }))} className="text-xs text-[var(--color-primary)]">+ Add set</button>
                </div>
              );
            })()}
            <Button className="w-full" loading={recordResult.isPending} onClick={saveResult}>
              {t('tournaments.save_result', 'Save Result')}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

export function resultFilters(t: (k: string, d?: string) => string): Array<{ key: ResultFilter; label: string }> {
  return [
    { key: 'attention', label: t('tournaments.matchessection.result_attention', 'Needs Attention') },
    { key: 'all', label: t('tournaments.matchessection.result_all', 'All Results') },
    { key: 'approved', label: t('tournaments.matchessection.result_approved', 'Approved') },
    { key: 'disputed', label: t('tournaments.matchessection.result_disputed', 'Disputed') },
    { key: 'withdrawn', label: t('tournaments.matchessection.result_withdrawn', 'Withdrawn') },
    { key: 'no_result', label: t('tournaments.matchessection.result_noresult', 'No Result') },
  ];
}

function formatWhen(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}