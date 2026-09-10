import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAdminResults, resolveDispute, correctResult, fetchSportFormats } from '../../../services/match-result.api';
import { useToast } from '../../../components/ui/Toast';
import { useTranslation } from '../../../i18n';
import { formatDateTime } from '../../../utils/formatDate';
import { Can } from '../../../permissions/Can';
import ResultSummaryView from '../../../components/match-result/ResultSummaryView';
import DynamicResultForm from '../../../components/match-result/DynamicResultForm';
import type { MatchResultRecord, RawMatchResultPayload } from '../../../types/match-result';

const filters = [
  { value: '', labelKey: 'matchResult.statusAll' },
  { value: 'pending_confirmation', labelKey: 'matchResult.statusPending' },
  { value: 'approved', labelKey: 'matchResult.statusApproved' },
  { value: 'disputed', labelKey: 'matchResult.statusDisputed' },
  { value: 'no_result', labelKey: 'matchResult.statusNoResult' },
];

type ModalState = { record: MatchResultRecord } & (
  | { mode: 'resolve-approve' }
  | { mode: 'resolve-noresult' }
  | { mode: 'correct' }
) | null;

export default function AdminMatchResultsPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('disputed');
  const [modal, setModal] = useState<ModalState>(null);
  const [note, setNote] = useState('');
  const [payload, setPayload] = useState<RawMatchResultPayload>({ outcome: 'completed' });

  const { data, isLoading } = useQuery({
    queryKey: ['admin-match-results', status],
    queryFn: () => fetchAdminResults(status || undefined),
  });

  const { data: formatsGroup } = useQuery({
    queryKey: ['sport-formats', modal?.record?.sportId],
    queryFn: () => fetchSportFormats(Number(modal!.record!.sportId)),
    enabled: !!modal?.record?.sportId,
  });

  const rules = (() => {
    if (modal?.mode === 'resolve-approve' || modal?.mode === 'correct') {
      const group = formatsGroup?.find((g) => g.ruleSets.length > 0);
      return group?.ruleSets[0]?.rules ?? modal.record.rulesSnapshot ?? null;
    }
    return null;
  })();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-match-results', status] });
  };

  const resolveMutation = useMutation({
    mutationFn: ({ approve, displayResult }: { approve: boolean; displayResult?: RawMatchResultPayload }) =>
      resolveDispute(modal!.record!.id, { approve, displayResult, note: note || undefined }),
    onSuccess: () => {
      showToast(t('matchResult.adminResolved'));
      setModal(null);
      setNote('');
      invalidate();
    },
    onError: (err: any) => showToast(err?.response?.data?.message || t('common.error'), 'error'),
  });

  const correctMutation = useMutation({
    mutationFn: () => correctResult(modal!.record!.id, payload),
    onSuccess: () => {
      showToast(t('matchResult.adminCorrected'));
      setModal(null);
      setPayload({ outcome: 'completed' });
      invalidate();
    },
    onError: (err: any) => showToast(err?.response?.data?.message || t('common.error'), 'error'),
  });

  const records = data?.records ?? [];

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('matchResult.adminTitle')}</h1>
        <div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
          >
            {filters.map((f) => (
              <option key={f.value} value={f.value}>{t(f.labelKey)}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <p className="text-[var(--color-text-muted)]">{t('common.loading')}</p>
      ) : records.length === 0 ? (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-8 text-center text-sm text-[var(--color-text-muted)]">
          {t('matchResult.noResults')}
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((r) => (
            <div key={r.id} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-[var(--color-text)]">
                  {t('matchResult.resultHeader', { id: r.id, matchId: r.matchId })}
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">{formatDateTime(r.updatedAt)}</span>
              </div>
              <ResultSummaryView record={r} participants={[]} />
              <div className="mt-3 flex flex-wrap gap-2">
                <Can permission="matches.result.manage">
                  {r.submissionStatus === 'disputed' && (
                    <>
                      <button
                        onClick={() => { setModal({ record: r, mode: 'resolve-approve' }); setPayload(r.rawResult || { outcome: 'completed' }); }}
                        className="px-3 py-1.5 text-xs font-medium bg-[var(--color-success)] text-white rounded-[var(--radius-md)] hover:opacity-90"
                      >
                        {t('matchResult.adminApprove')}
                      </button>
                      <button
                        onClick={() => { setModal({ record: r, mode: 'resolve-noresult' }); }}
                        className="px-3 py-1.5 text-xs font-medium border border-[var(--color-error)] text-[var(--color-error)] rounded-[var(--radius-md)] hover:bg-[var(--color-error)]/10"
                      >
                        {t('matchResult.adminNoResult')}
                      </button>
                    </>
                  )}
                  {r.submissionStatus === 'approved' && r.outcome !== 'no_result' && (
                    <button
                      onClick={() => { setModal({ record: r, mode: 'correct' }); setPayload(r.rawResult || { outcome: 'completed' }); }}
                      className="px-3 py-1.5 text-xs font-medium border border-[var(--color-primary)] text-[var(--color-primary)] rounded-[var(--radius-md)] hover:bg-[var(--color-primary)]/10"
                    >
                      {t('matchResult.adminCorrect')}
                    </button>
                  )}
                </Can>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center bg-black/50 p-0 md:p-4">
          <div className="w-full max-w-xl bg-[var(--color-surface)] rounded-t-[var(--radius-lg)] md:rounded-[var(--radius-lg)] shadow-lg p-4 md:p-6 mb-16 md:mb-0 md:mt-16 max-h-[80vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-3">
              {modal.mode === 'correct'
                ? t('matchResult.adminCorrectTitle')
                : modal.mode === 'resolve-noresult'
                  ? t('matchResult.adminNoResultTitle')
                  : t('matchResult.adminResolveTitle')}
            </h2>

            {modal.mode !== 'resolve-noresult' && rules && (
              <div className="mb-4">
                <DynamicResultForm rules={rules} value={payload} onChange={setPayload} />
              </div>
            )}

            {modal.mode === 'resolve-noresult' && (
              <p className="text-sm text-[var(--color-text-muted)] mb-4">{t('matchResult.adminNoResultPrompt')}</p>
            )}

            <div className="mb-4">
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('matchResult.adminNote')}</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
              />
            </div>

            <div className="flex gap-2">
              {modal.mode === 'resolve-approve' && (
                <button
                  onClick={() => resolveMutation.mutate({ approve: true, displayResult: payload })}
                  disabled={resolveMutation.isPending}
                  className="px-4 py-2 text-sm font-medium bg-[var(--color-success)] text-white rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50"
                >
                  {t('matchResult.adminApproveSubmit')}
                </button>
              )}
              {modal.mode === 'resolve-noresult' && (
                <button
                  onClick={() => resolveMutation.mutate({ approve: false })}
                  disabled={resolveMutation.isPending}
                  className="px-4 py-2 text-sm font-medium bg-[var(--color-error)] text-white rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50"
                >
                  {t('matchResult.adminNoResultSubmit')}
                </button>
              )}
              {modal.mode === 'correct' && (
                <button
                  onClick={() => correctMutation.mutate()}
                  disabled={correctMutation.isPending}
                  className="px-4 py-2 text-sm font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50"
                >
                  {t('matchResult.adminCorrectSave')}
                </button>
              )}
              <button
                onClick={() => { setModal(null); setNote(''); }}
                className="px-4 py-2 text-sm font-medium border border-[var(--color-border)] text-[var(--color-text)] rounded-[var(--radius-md)]"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}