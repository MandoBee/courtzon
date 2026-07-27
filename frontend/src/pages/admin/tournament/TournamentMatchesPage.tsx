import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../../../i18n';
import { useToast } from '../../../components/ui/Toast';
import { Can } from '../../../permissions/Can';
import { getErrorMessage } from '../../../utils/errors';
import { SkeletonRow } from '../../../components/ui/Skeleton';
import { Modal } from '../../../components/ui/Modal';

import { tournamentApi } from '../../../services/tournament';

const MATCH_STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  walkover: 'bg-purple-100 text-purple-700',
};

export default function TournamentMatchesPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const qc = useQueryClient();

  const [tournamentFilter, setTournamentFilter] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;
  const [resultModal, setResultModal] = useState<{ matchId: number; open: boolean }>({ matchId: 0, open: false });
  const [resultData, setResultData] = useState({ score: '', winner_id: '', status: 'completed' });
  const [courtAssign, setCourtAssign] = useState<{ matchId: number; resourceId: string }>({ matchId: 0, resourceId: '' });
  const [refereeAssign, setRefereeAssign] = useState<{ matchId: number; refereeId: string }>({ matchId: 0, refereeId: '' });

  const { data: tournaments } = useQuery({
    queryKey: ['admin-tournaments-simple'],
    queryFn: () => tournamentApi.getTournaments({ limit: 100 }),
  });

  const params: Record<string, any> = { page, limit };
  if (tournamentFilter) params.tournament_id = tournamentFilter;

  const { data: matchesData, isLoading } = useQuery({
    queryKey: ['tournament-admin-matches', params],
    queryFn: () => {
      if (tournamentFilter) {
        return tournamentApi.getMatches(Number(tournamentFilter));
      }
      return Promise.resolve({ data: [], total: 0, page: 1, limit: 20 });
    },
    enabled: !!tournamentFilter,
  });

  const recordResultMutation = useMutation({
    mutationFn: () => tournamentApi.recordResult(resultModal.matchId, {
      score: resultData.score,
      winner_id: resultData.winner_id ? Number(resultData.winner_id) : undefined,
      status: resultData.status,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tournament-admin-matches'] }); setResultModal({ matchId: 0, open: false }); setResultData({ score: '', winner_id: '', status: 'completed' }); showToast(t('tournaments.result_recorded')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const assignCourtMutation = useMutation({
    mutationFn: () => tournamentApi.assignCourt(courtAssign.matchId, Number(courtAssign.resourceId)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tournament-admin-matches'] }); setCourtAssign({ matchId: 0, resourceId: '' }); showToast(t('tournaments.court_assigned')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const assignRefereeMutation = useMutation({
    mutationFn: () => tournamentApi.assignReferee(refereeAssign.matchId, Number(refereeAssign.refereeId)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tournament-admin-matches'] }); setRefereeAssign({ matchId: 0, refereeId: '' }); showToast(t('tournaments.referee_assigned')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const matches = Array.isArray(matchesData) ? matchesData : matchesData?.data ?? [];

  return (
    <Can permission="admin-tournaments.view">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('tournaments.matches.title')}</h1>

        <div className="flex gap-3">
          <select value={tournamentFilter} onChange={(e) => { setTournamentFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border rounded-[var(--radius-md)] text-sm bg-[var(--color-surface)] min-w-[250px]">
            <option value="">{t('tournaments.select_tournament')}</option>
            {(tournaments?.data ?? []).map((t: any) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {!tournamentFilter && (
          <p className="text-sm text-[var(--color-text-muted)] py-8 text-center">{t('tournaments.select_tournament_hint')}</p>
        )}

        {tournamentFilter && (
          <>
            {isLoading ? <SkeletonRow count={5} /> : (
              <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-[var(--color-text-muted)]">
                      <th className="text-left px-4 py-3">{t('tournaments.match.round')}</th>
                      <th className="text-left px-4 py-3">{t('tournaments.match.match_no')}</th>
                      <th className="text-left px-4 py-3">{t('tournaments.match.player1')}</th>
                      <th className="text-left px-4 py-3">{t('tournaments.match.player2')}</th>
                      <th className="text-left px-4 py-3">{t('tournaments.match.court')}</th>
                      <th className="text-left px-4 py-3">{t('tournaments.match.referee')}</th>
                      <th className="text-left px-4 py-3">{t('tournaments.match.status')}</th>
                      <th className="text-left px-4 py-3">{t('tournaments.match.score')}</th>
                      <th className="text-right px-4 py-3">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.length === 0 && (
                      <tr><td colSpan={9} className="text-center py-8 text-sm text-[var(--color-text-muted)]">{t('common.no_results')}</td></tr>
                    )}
                    {matches.map((m: any) => (
                      <tr key={m.id} className="border-b last:border-0 hover:bg-[var(--color-bg)]/30">
                        <td className="px-4 py-3 text-xs">{m.round ?? '-'}</td>
                        <td className="px-4 py-3 font-mono text-xs">{m.match_number ?? m.match_no ?? '-'}</td>
                        <td className="px-4 py-3">{m.player1_name || m.player1?.name || '-'}</td>
                        <td className="px-4 py-3">{m.player2_name || m.player2?.name || '-'}</td>
                        <td className="px-4 py-3 text-xs">
                          {courtAssign.matchId === m.id ? (
                            <div className="flex gap-1">
                              <input type="number" value={courtAssign.resourceId} onChange={(e) => setCourtAssign((prev) => ({ ...prev, resourceId: e.target.value }))}
                                className="w-16 px-1 py-0.5 border rounded text-[10px]" placeholder="ID" />
                              <button onClick={() => assignCourtMutation.mutate()}
                                className="text-[10px] px-1 py-0.5 bg-[var(--color-primary)] text-white rounded">OK</button>
                              <button onClick={() => setCourtAssign({ matchId: 0, resourceId: '' })}
                                className="text-[10px] px-1 py-0.5 border rounded">X</button>
                            </div>
                          ) : (
                            <span>{m.court_name || m.resource_name || '-'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {refereeAssign.matchId === m.id ? (
                            <div className="flex gap-1">
                              <input type="number" value={refereeAssign.refereeId} onChange={(e) => setRefereeAssign((prev) => ({ ...prev, refereeId: e.target.value }))}
                                className="w-16 px-1 py-0.5 border rounded text-[10px]" placeholder="ID" />
                              <button onClick={() => assignRefereeMutation.mutate()}
                                className="text-[10px] px-1 py-0.5 bg-[var(--color-primary)] text-white rounded">OK</button>
                              <button onClick={() => setRefereeAssign({ matchId: 0, refereeId: '' })}
                                className="text-[10px] px-1 py-0.5 border rounded">X</button>
                            </div>
                          ) : (
                            <span>{m.referee_name || '-'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${MATCH_STATUS_COLORS[m.status] || ''}`}>
                            {t(`tournaments.match_status.${m.status}`)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs font-mono">{m.score || '-'}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Can permission="tournaments.edit">
                              <button onClick={() => setCourtAssign({ matchId: m.id, resourceId: '' })}
                                className="text-[10px] px-2 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                                {t('tournaments.assign_court')}
                              </button>
                              <button onClick={() => setRefereeAssign({ matchId: m.id, refereeId: '' })}
                                className="text-[10px] px-2 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                                {t('tournaments.assign_referee')}
                              </button>
                              <button onClick={() => { setResultModal({ matchId: m.id, open: true }); setResultData({ score: m.score || '', winner_id: '', status: 'completed' }); }}
                                className="text-[10px] px-2 py-1 rounded border border-green-200 text-green-600 hover:bg-green-50">
                                {t('tournaments.record_result')}
                              </button>
                            </Can>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        <Modal open={resultModal.open} onClose={() => setResultModal({ matchId: 0, open: false })}
          title={t('tournaments.record_result')} size="sm">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('tournaments.match.score')}</label>
              <input value={resultData.score} onChange={(e) => setResultData((p) => ({ ...p, score: e.target.value }))}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm" placeholder="e.g. 6-4, 6-3" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('tournaments.match.winner_id')}</label>
              <input type="number" value={resultData.winner_id} onChange={(e) => setResultData((p) => ({ ...p, winner_id: e.target.value }))}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('tournaments.match.status')}</label>
              <select value={resultData.status} onChange={(e) => setResultData((p) => ({ ...p, status: e.target.value }))}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm">
                <option value="completed">{t('tournaments.match_status.completed')}</option>
                <option value="walkover">{t('tournaments.match_status.walkover')}</option>
                <option value="cancelled">{t('tournaments.match_status.cancelled')}</option>
              </select>
            </div>
            <button onClick={() => recordResultMutation.mutate()}
              className="w-full px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium">
              {t('tournaments.save_result')}
            </button>
          </div>
        </Modal>
      </div>
    </Can>
  );
}
