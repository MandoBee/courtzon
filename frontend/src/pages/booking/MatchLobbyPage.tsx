import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import { useAuthStore } from '../../store/auth.store';
import { useTranslation } from '../../i18n';
import { formatISODate, formatDateTime } from '../../utils/formatDate';
import { socketService } from '../../services/socket';
import ManageApplicantsPopup from '../../components/booking/ManageApplicantsPopup';
import { fetchMatchResult } from '../../services/match-result.api';
import ResultSummaryView from '../../components/match-result/ResultSummaryView';
import { Can } from '../../permissions/Can';
import MatchErrorState from '../../components/booking/MatchErrorState';

function hasUserInParticipants(participantsJson: unknown, userId: number): boolean {
  if (!participantsJson) return false;
  const list = Array.isArray(participantsJson)
    ? participantsJson
    : typeof participantsJson === 'string'
      ? (() => { try { return JSON.parse(participantsJson); } catch { return []; } })()
      : [];
  return list.some((p: any) => Number(p.userId) === Number(userId));
}

export default function MatchLobbyPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [showApplicants, setShowApplicants] = useState(false);
  const user = useAuthStore((s) => s.user);

  const { data: match, isLoading, isError: isMatchError, error: matchError, refetch: refetchMatch } = useQuery({
    queryKey: ['match', id],
    queryFn: () => api.get(`/matches/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });

  const { data: resultData } = useQuery({
    queryKey: ['match-result', id],
    queryFn: () => fetchMatchResult(Number(id)),
    enabled: !!id,
  });
  const resultAvailable = !!resultData?.record;
  const rs = match?.result_state as 'approved' | 'disputed' | 'pending' | 'no_result' | 'enter' | 'expired' | 'none' | undefined;
  const resultEntryEligible = rs === 'enter';
  const windowClosed = rs === 'expired';
  const isParticipant = match?.is_participant === true
    || (user?.id != null && match?.participants_json && hasUserInParticipants(match.participants_json, user.id));
  const isFull = Number(match?.participant_count ?? 0) >= Number(match?.max_players ?? 0);
  const joinRequestPending = match?.join_request_status === 'submitted';

  useEffect(() => {
    if (!id) return;
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['match', id] });
      queryClient.invalidateQueries({ queryKey: ['match-applicants', Number(id)] });
    };
    socketService.on('match.pending', invalidate);
    socketService.on('match.updated', invalidate);
    socketService.on('match.removed', invalidate);
    return () => {
      socketService.off('match.pending', invalidate);
      socketService.off('match.updated', invalidate);
      socketService.off('match.removed', invalidate);
    };
  }, [id, queryClient]);

  const joinMutation = useMutation({
    mutationFn: () => api.post(`/matches/${id}/join`),
    onSuccess: () => {
      showToast(t('match.joined_awaiting_approval'));
      queryClient.invalidateQueries({ queryKey: ['match', id] });
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message || t('match.failed_to_join'), 'error');
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: () => api.post(`/matches/${id}/withdraw`),
    onSuccess: () => {
      showToast(t('match.application_withdrawn'), 'info');
      queryClient.invalidateQueries({ queryKey: ['match', id] });
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message || t('match.failed_to_withdraw'), 'error');
    },
  });

  const closeMutation = useMutation({
    mutationFn: () => api.post(`/matches/${id}/close`),
    onSuccess: () => {
      showToast(t('match.applications_closed'), 'success');
      queryClient.invalidateQueries({ queryKey: ['match', id] });
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message || t('match.failed_to_close'), 'error');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.post(`/matches/${id}/cancel`),
    onSuccess: () => {
      showToast(t('match.cancelled'), 'warning');
      navigate('/matches');
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message || t('match.failed_to_cancel'), 'error');
    },
  });

  if (isLoading) return <p className="text-[var(--color-text-muted)]">Loading...</p>;
  if (isMatchError) return <MatchErrorState error={matchError} onRetry={() => refetchMatch()} />;
  if (!match) return <p className="text-[var(--color-text-muted)]">Match not found</p>;

  const participants = (() => {
    if (!match.participants_json) return [];
    if (Array.isArray(match.participants_json)) return match.participants_json;
    if (typeof match.participants_json === 'string') {
      try { return JSON.parse(match.participants_json); } catch { return []; }
    }
    return [];
  })();
  const isCreator = user?.id && match.creator_id && Number(user.id) === Number(match.creator_id);

  const TERMINAL_MATCH_STATUSES = ['completed', 'cancelled', 'void'] as const;
  const isTerminal = TERMINAL_MATCH_STATUSES.some((s) => s === match.status);

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      open: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]',
      full: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
      closed: 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]',
      in_progress: 'bg-[var(--color-primary-bg)] text-[var(--color-primary-text)]',
      completed: 'bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]',
      cancelled: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
      void: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
    };
    return `px-2 py-0.5 text-xs rounded-full ${colors[status] || ''}`;
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{match.resource_name}</h1>
        <span className={getStatusBadge(match.status)}>{match.status}</span>
      </div>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 mb-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-muted)] mb-2">Match Details</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-[var(--color-text-muted)]">Sport:</span> {match.sport_name}</div>
          <div><span className="text-[var(--color-text-muted)]">Venue:</span> {match.organisation_name}</div>
          <div><span className="text-[var(--color-text-muted)]">Branch:</span> {match.branch_name}</div>
          <div><span className="text-[var(--color-text-muted)]">Date:</span> {formatISODate(match.booking_date)}</div>
          <div><span className="text-[var(--color-text-muted)]">Time:</span> {match.start_time?.slice(0, 5)} - {match.end_time?.slice(0, 5)}</div>
          <div><span className="text-[var(--color-text-muted)]">Capacity:</span> {match.participant_count}/{match.max_players}</div>
          {match.auto_accept === 1 && <div><span className="text-[var(--color-success-text)]">Auto-accept enabled</span></div>}
          {match.deadline && <div><span className="text-[var(--color-text-muted)]">Deadline:</span> {formatDateTime(match.deadline)}</div>}
        </div>
      </div>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 mb-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-muted)] mb-2">Participants ({participants.length})</h2>
        {participants.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">No participants yet. Be the first to join!</p>
        ) : (
          <div className="space-y-1">
            {participants.map((p: any, i: number) => (
              <div key={i} className="flex items-center gap-2.5 text-sm py-1.5 px-2 rounded-[var(--radius-md)]">
                {p.avatarUrl ? (
                  <img
                    src={p.avatarUrl}
                    alt={p.fullName || 'Player'}
                    className="w-8 h-8 rounded-full object-cover bg-[var(--color-surface-muted)]"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="w-8 h-8 rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)] flex items-center justify-center text-xs font-semibold uppercase">
                    {(p.fullName || 'P').charAt(0)}
                  </span>
                )}
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="font-medium text-[var(--color-text)] truncate">{p.fullName || `Player ${p.userId}`}</span>
                    {p.role === 'host' && (
                      <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
                        Host
                      </span>
                    )}
                  </span>
                  {p.phone && (
                    <a href={`tel:${p.phone}`} className="text-xs text-[var(--color-primary)] hover:underline">
                      {p.phone}
                    </a>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-[var(--color-text-muted)]">{t('matchResult.title')}</h2>
          {(resultAvailable || (resultEntryEligible && isParticipant)) && (
            <Link to={`/matches/${id}/result`} className="text-sm text-[var(--color-primary)] hover:underline">
              {resultAvailable ? t('matchResult.view') : t('matchResult.enterResult')}
            </Link>
          )}
        </div>
        {resultAvailable ? (
          <ResultSummaryView record={resultData!.record!} participants={resultData!.participants || []} showRating />
        ) : resultEntryEligible ? (
          <p className="text-sm text-[var(--color-text-muted)]">{t('matchResult.noResultYet')}</p>
        ) : windowClosed ? (
          <p className="text-sm text-[var(--color-text-muted)]">{t('matchResult.expiredState')}</p>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">{t('matchResult.enterAfterStart')}</p>
        )}
        {resultEntryEligible && !resultAvailable && isParticipant && (
          <div className="mt-3">
            <Can permission="matches.result.submit">
              <Link
                to={`/matches/${id}/result`}
                className="inline-block px-4 py-2 text-sm font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90"
              >
                {t('matchResult.submit')}
              </Link>
            </Can>
          </div>
        )}
      </div>

      {!isTerminal && (
        <div className="flex flex-wrap gap-2">
          {['open', 'full'].includes(match.status) && !isCreator && !isParticipant && !joinRequestPending && (
            <button
              onClick={() => joinMutation.mutate()}
              disabled={joinMutation.isPending}
              className="px-4 py-2 text-sm font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50"
            >
              {isFull ? 'Join Waiting List' : 'Join Match'}
            </button>
          )}
          {joinRequestPending && !isParticipant && (
            <button
              onClick={() => withdrawMutation.mutate()}
              disabled={withdrawMutation.isPending}
              className="px-4 py-2 text-sm font-medium border border-[var(--color-border)] text-[var(--color-text)] rounded-[var(--radius-md)] hover:bg-[var(--color-surface-muted)]"
            >
              Withdraw
            </button>
          )}
          {isCreator && (
            <>
              <button
                onClick={() => setShowApplicants(true)}
                className="px-4 py-2 text-sm font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90"
              >
                Manage Applicants
              </button>
              {match.status === 'open' && (
                <button
                  onClick={() => closeMutation.mutate()}
                  className="px-4 py-2 text-sm font-medium border border-[var(--color-warning)] text-[var(--color-warning)] rounded-[var(--radius-md)] hover:bg-[var(--color-warning)]/10"
                >
                  Close Applications
                </button>
              )}
              <button
                onClick={() => { if (confirm('Cancel this match?')) cancelMutation.mutate(); }}
                className="px-4 py-2 text-sm font-medium bg-[var(--color-error)] text-white rounded-[var(--radius-md)] hover:opacity-90"
              >
                Cancel Match
              </button>
            </>
          )}
        </div>
      )}

      <ManageApplicantsPopup
        open={showApplicants}
        bookingId={Number(id)}
        onClose={() => setShowApplicants(false)}
      />
    </div>
  );
}
