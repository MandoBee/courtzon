import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { fetchMatchResult, submitMatchResult, replaceMatchResult, withdrawMatchResult, acceptMatchResult, disputeMatchResult, fetchSportFormats } from '../../services/match-result.api';
import { useToast } from '../../components/ui/Toast';
import { useAuthStore } from '../../store/auth.store';
import { useTranslation } from '../../i18n';
import { formatDateTime } from '../../utils/formatDate';
import { Can } from '../../permissions/Can';
import DynamicResultForm from '../../components/match-result/DynamicResultForm';
import ResultSummaryView from '../../components/match-result/ResultSummaryView';
import type { RawMatchResultPayload } from '../../types/match-result';

function fetchMatchResultMeta(id: number) {
  return api.get(`/matches/${id}`).then((r) => r.data.data);
}

function hasParticipant(participantsJson: unknown, userId: number): boolean {
  if (!participantsJson) return false;
  const list = Array.isArray(participantsJson)
    ? participantsJson
    : typeof participantsJson === 'string'
      ? (() => { try { return JSON.parse(participantsJson); } catch { return []; } })()
      : [];
  return list.some((p: any) => Number(p.userId) === Number(userId));
}

const SUBMISSION_WINDOW_MS = 72 * 3600 * 1000;

function windowExpired(playedAt?: string | null): boolean {
  if (!playedAt) return false;
  const t = new Date(playedAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() > t + SUBMISSION_WINDOW_MS;
}

export default function MatchResultPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [editing, setEditing] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [payload, setPayload] = useState<RawMatchResultPayload>({ outcome: 'completed' });

  const { data: match, isLoading: matchLoading } = useQuery({
    queryKey: ['match', id],
    queryFn: () => fetchMatchResultMeta(Number(id)),
    enabled: !!id,
  });

  const { data: resultData, isLoading: resultLoading } = useQuery({
    queryKey: ['match-result', id],
    queryFn: () => fetchMatchResult(Number(id)),
    enabled: !!id,
  });

  const { data: formatsData } = useQuery({
    queryKey: ['sport-formats', match?.sport_id],
    queryFn: () => fetchSportFormats(Number(match!.sport_id)),
    enabled: !!match?.sport_id,
  });

  const rules = useMemo(() => {
    const group = formatsData?.find((g) => g.ruleSets.length > 0);
    return group?.ruleSets[0]?.rules ?? null;
  }, [formatsData]);

  const record = resultData?.record ?? null;
  const participants = resultData?.participants ?? [];
  const isParticipant = user?.id != null && hasParticipant(match?.participants_json, user.id);
  const isSubmitter = record != null && user?.id != null && Number(record.submittedBy) === Number(user.id);
  const canReview = record?.submissionStatus === 'pending_confirmation' && isParticipant && !isSubmitter;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['match-result', id] });
    queryClient.invalidateQueries({ queryKey: ['match', id] });
  };

  const submitMutation = useMutation({
    mutationFn: () => submitMatchResult(Number(id), payload),
    onSuccess: () => {
      showToast(t('matchResult.submitted'));
      setEditing(false);
      invalidate();
    },
    onError: (err: any) => showToast(err?.response?.data?.message || t('common.error'), 'error'),
  });

  const replaceMutation = useMutation({
    mutationFn: () => replaceMatchResult(Number(id), payload),
    onSuccess: () => {
      showToast(t('matchResult.replaced'));
      setEditing(false);
      invalidate();
    },
    onError: (err: any) => showToast(err?.response?.data?.message || t('common.error'), 'error'),
  });

  const withdrawMutation = useMutation({
    mutationFn: () => withdrawMatchResult(Number(id)),
    onSuccess: () => {
      showToast(t('matchResult.withdrawnToast'));
      setEditing(false);
      invalidate();
    },
    onError: (err: any) => showToast(err?.response?.data?.message || t('common.error'), 'error'),
  });

  const acceptMutation = useMutation({
    mutationFn: () => acceptMatchResult(Number(id)),
    onSuccess: () => {
      showToast(t('matchResult.accepted'));
      invalidate();
    },
    onError: (err: any) => showToast(err?.response?.data?.message || t('common.error'), 'error'),
  });

  const disputeMutation = useMutation({
    mutationFn: () => disputeMatchResult(Number(id), disputeReason),
    onSuccess: () => {
      showToast(t('matchResult.disputed'));
      setDisputeOpen(false);
      invalidate();
    },
    onError: (err: any) => showToast(err?.response?.data?.message || t('common.error'), 'error'),
  });

  if (matchLoading || resultLoading) return <p className="text-[var(--color-text-muted)]">{t('common.loading')}</p>;
  if (!match) return <p className="text-[var(--color-text-muted)]">{t('matchResult.notFound')}</p>;

  const editableOutcome = payload.outcome;

  return (
    <div className="max-w-2xl mx-auto pb-24 md:pb-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('matchResult.title')}</h1>
        <Link to={`/matches/${id}`} className="text-sm text-[var(--color-primary)] hover:underline">
          {t('common.back')}
        </Link>
      </div>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 mb-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-[var(--color-text-muted)]">{t('matchResult.sport')}:</span> {match.sport_name}</div>
          <div><span className="text-[var(--color-text-muted)]">{t('matchResult.playedAt')}:</span> {formatDateTime(record?.playedAt || match.played_at || match.booking_date)}</div>
        </div>
      </div>

      {record ? (
        <>
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 mb-4">
            <h2 className="text-sm font-semibold text-[var(--color-text-muted)] mb-3">{t('matchResult.current')}</h2>
            <ResultSummaryView record={record} participants={participants} showRating />
          </div>

          {canReview && (
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 mb-4 space-y-3">
              <p className="text-sm text-[var(--color-text)]">{t('matchResult.confirmPrompt')}</p>
              <div className="flex flex-wrap gap-2">
                <Can permission="matches.result.accept">
                  <button
                    onClick={() => acceptMutation.mutate()}
                    disabled={acceptMutation.isPending}
                    className="px-4 py-2 text-sm font-medium bg-[var(--color-success)] text-white rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50"
                  >
                    {t('matchResult.accept')}
                  </button>
                </Can>
                <Can permission="matches.result.dispute">
                  <button
                    onClick={() => setDisputeOpen(true)}
                    disabled={disputeMutation.isPending}
                    className="px-4 py-2 text-sm font-medium border border-[var(--color-error)] text-[var(--color-error)] rounded-[var(--radius-md)] hover:bg-[var(--color-error)]/10 disabled:opacity-50"
                  >
                    {t('matchResult.dispute')}
                  </button>
                </Can>
              </div>
              {disputeOpen && (
                <div className="space-y-2 pt-2">
                  <textarea
                    rows={3}
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    placeholder={t('matchResult.disputePlaceholder')}
                    className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => disputeMutation.mutate()}
                      disabled={disputeReason.trim().length < 10 || disputeMutation.isPending}
                      className="px-4 py-2 text-sm font-medium bg-[var(--color-error)] text-white rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50"
                    >
                      {t('matchResult.submitDispute')}
                    </button>
                    <button
                      onClick={() => setDisputeOpen(false)}
                      className="px-4 py-2 text-sm font-medium border border-[var(--color-border)] text-[var(--color-text)] rounded-[var(--radius-md)]"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {isSubmitter && record.submissionStatus === 'pending_confirmation' && (
            <div className="flex gap-2 mb-4">
              <Can permission="matches.result.submit">
                <button
                  onClick={() => setEditing((v) => !v)}
                  className="px-4 py-2 text-sm font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90"
                >
                  {editing ? t('common.cancel') : t('matchResult.replace')}
                </button>
                <button
                  onClick={() => withdrawMutation.mutate()}
                  disabled={withdrawMutation.isPending}
                  className="px-4 py-2 text-sm font-medium border border-[var(--color-error)] text-[var(--color-error)] rounded-[var(--radius-md)] hover:bg-[var(--color-error)]/10 disabled:opacity-50"
                >
                  {t('matchResult.withdraw')}
                </button>
              </Can>
            </div>
          )}

          {isSubmitter && record.submissionStatus === 'withdrawn' && (
            <div className="mb-4">
              <Can permission="matches.result.submit">
                <button
                  onClick={() => setEditing((v) => !v)}
                  className="px-4 py-2 text-sm font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90"
                >
                  {editing ? t('common.cancel') : t('matchResult.enterResult')}
                </button>
              </Can>
            </div>
          )}
        </>
      ) : (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 mb-4">
          {!isParticipant ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t('matchResult.notParticipant')}</p>
          ) : !rules ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t('matchResult.noRules')}</p>
          ) : !match.played_at ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t('matchResult.noPlayTime')}</p>
          ) : windowExpired(match.played_at) ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t('matchResult.expiredState')}</p>
          ) : (
            <div className={`space-y-4 ${editing ? 'opacity-50 pointer-events-none' : ''}`}>
              <h2 className="text-sm font-semibold text-[var(--color-text-muted)]">{t('matchResult.enterScore')}</h2>
              <DynamicResultForm rules={rules} value={payload} onChange={setPayload} />
              <Can permission="matches.result.submit">
                <button
                  onClick={() => submitMutation.mutate()}
                  disabled={submitMutation.isPending || !payload.outcome}
                  className="w-full px-4 py-2 text-sm font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50"
                >
                  {t('matchResult.submit')}
                </button>
              </Can>
              <p className="text-xs text-[var(--color-text-muted)]">{t('matchResult.outcome')}: {editableOutcome}</p>
            </div>
          )}
        </div>
      )}

      {record && isSubmitter && editing && rules && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 mb-4 space-y-4">
          {record.submissionStatus === 'withdrawn' && (
            <p className="text-sm text-[var(--color-text-muted)]">{t('matchResult.withdrawnResubmit')}</p>
          )}
          <h2 className="text-sm font-semibold text-[var(--color-text-muted)]">
            {record.submissionStatus === 'withdrawn' ? t('matchResult.enterScore') : t('matchResult.editScore')}
          </h2>
          <DynamicResultForm
            rules={rules}
            value={record.submissionStatus === 'withdrawn' ? payload : record.rawResult}
            onChange={setPayload}
          />
          {record.submissionStatus === 'withdrawn' ? (
            <button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending || !payload.outcome}
              className="w-full px-4 py-2 text-sm font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50"
            >
              {t('matchResult.submit')}
            </button>
          ) : (
            <button
              onClick={() => replaceMutation.mutate()}
              disabled={replaceMutation.isPending}
              className="w-full px-4 py-2 text-sm font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50"
            >
              {t('matchResult.saveReplacement')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}