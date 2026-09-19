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

const SHARED_STATUS_COLORS: Record<string, string> = {
  closed: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
};

interface ResultForm {
  outcome: string;
  winnerSide: string;
  sets: { home: string; away: string }[];
  homeGoals: string;
  awayGoals: string;
}

function emptyResultForm(): ResultForm {
  return { outcome: 'completed', winnerSide: '', sets: [{ home: '', away: '' }], homeGoals: '', awayGoals: '' };
}

/** Build the shared RawMatchResultPayload ({outcome, winner, score, termination}). */
function buildResultPayload(form: ResultForm, scoreStructure: string | undefined): any {
  const winner = form.winnerSide || null;
  if (form.outcome === 'abandoned') return { outcome: 'abandoned', winner: null };
  if (form.outcome === 'completed') {
    if (scoreStructure === 'goals') {
      return { outcome: 'completed', winner: null, score: { homeGoals: Number(form.homeGoals || 0), awayGoals: Number(form.awayGoals || 0) } };
    }
    const sets = form.sets
      .map((s) => ({ home: Number(s.home), away: Number(s.away) }))
      .filter((s) => Number.isInteger(s.home) && Number.isInteger(s.away) && s.home >= 0 && s.away >= 0);
    if (sets.length === 0) return { outcome: 'completed', winner: null, score: { sets: [{ home: 0, away: 0 }] } };
    return { outcome: 'completed', winner: null, score: { sets } };
  }
  if (form.outcome === 'retired') {
    return { outcome: 'retired', winner: null, termination: { retired_side: winner } };
  }
  return { outcome: form.outcome, winner };
}

export default function TournamentMatchesPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const qc = useQueryClient();

  const [tournamentFilter, setTournamentFilter] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;
  const [resultModal, setResultModal] = useState<{ matchId: number; open: boolean }>({ matchId: 0, open: false });
  const [resultData, setResultData] = useState<ResultForm>(emptyResultForm());
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
    mutationFn: (payload: any) => tournamentApi.recordResult(resultModal.matchId, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tournament-admin-matches'] }); qc.invalidateQueries({ queryKey: ['tournaments'] }); setResultModal({ matchId: 0, open: false }); setResultData(emptyResultForm()); showToast(t('tournaments.result_recorded')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const startMatchMutation = useMutation({
    mutationFn: (matchId: number) => tournamentApi.startMatch(matchId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tournament-admin-matches'] }); qc.invalidateQueries({ queryKey: ['tournaments'] }); showToast(t('tournaments.match_started', 'Match started')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const completeMatchMutation = useMutation({
    mutationFn: (matchId: number) => tournamentApi.completeMatch(matchId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tournament-admin-matches'] }); qc.invalidateQueries({ queryKey: ['tournaments'] }); showToast(t('tournaments.match_completed', 'Match completed')); },
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
  const selectedMatch = matches.find((m: any) => m.id === resultModal.matchId) as any;

  const saveResult = () => {
    const ruleSnap = selectedMatch?.rule_snapshot ? (typeof selectedMatch.rule_snapshot === 'string' ? JSON.parse(selectedMatch.rule_snapshot) : selectedMatch.rule_snapshot) : null;
    const scoreStructure = ruleSnap?.score_structure;
    recordResultMutation.mutate(buildResultPayload(resultData, scoreStructure));
  };

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
                    {matches.map((m: any) => {
                      const sharedStatus = m.shared_status ?? null;
                      const canStart = sharedStatus === 'closed';
                      const canPlay = sharedStatus === 'in_progress' || sharedStatus === 'completed';
                      return (
                        <tr key={m.id} className="border-b last:border-0 hover:bg-[var(--color-bg)]/30">
                          <td className="px-4 py-3 text-xs">{m.round ?? '-'}</td>
                          <td className="px-4 py-3 font-mono text-xs">{m.match_number ?? m.match_no ?? '-'}</td>
                          <td className="px-4 py-3">{m.player1_name || m.player1?.name || (m.player1_id ? `Player #${m.player1_id}` : '-')}</td>
                          <td className="px-4 py-3">{m.player2_name || m.player2?.name || (m.player2_id ? `Player #${m.player2_id}` : '-')}</td>
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
                          <td className="px-4 py-3 text-xs">
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${MATCH_STATUS_COLORS[m.status] || ''}`}>
                              {t(`tournaments.match_status.${m.status}`)}
                            </span>
                            {sharedStatus && (
                              <span className={`inline-block ml-1 px-2 py-0.5 rounded text-[10px] font-medium ${SHARED_STATUS_COLORS[sharedStatus] || ''}`}>
                                {sharedStatus}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono">{m.score_summary || '-'}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1 flex-wrap">
                              <Can permission="tournament.manage">
                                <button onClick={() => setCourtAssign({ matchId: m.id, resourceId: '' })}
                                  className="text-[10px] px-2 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                                  {t('tournaments.assign_court')}
                                </button>
                                <button onClick={() => setRefereeAssign({ matchId: m.id, refereeId: '' })}
                                  className="text-[10px] px-2 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                                  {t('tournaments.assign_referee')}
                                </button>
                                {canStart && (
                                  <button onClick={() => startMatchMutation.mutate(m.id)}
                                    className="text-[10px] px-2 py-1 rounded border border-blue-200 text-blue-600 hover:bg-blue-50">
                                    {t('tournaments.start_match', 'Start Match')}
                                  </button>
                                )}
                                {canPlay && (
                                  <button onClick={() => completeMatchMutation.mutate(m.id)}
                                    className="text-[10px] px-2 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                                    {t('tournaments.complete_match', 'Complete')}
                                  </button>
                                )}
                              </Can>
                              <Can permission="tournament.result.manage">
                                <button onClick={() => { setResultModal({ matchId: m.id, open: true }); setResultData(emptyResultForm()); }}
                                  className="text-[10px] px-2 py-1 rounded border border-green-200 text-green-600 hover:bg-green-50">
                                  {t('tournaments.record_result')}
                                </button>
                              </Can>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
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
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('tournaments.match.status')}</label>
              <select value={resultData.outcome} onChange={(e) => setResultData((p) => ({ ...p, outcome: e.target.value }))}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm">
                <option value="completed">{t('tournaments.match_status.completed')}</option>
                <option value="walkover">{t('tournaments.match_status.walkover')}</option>
                <option value="forfeit">Forfeit</option>
                <option value="retired">Retired</option>
                <option value="abandoned">Abandoned</option>
              </select>
            </div>

            {(resultData.outcome !== 'completed' && resultData.outcome !== 'abandoned') && (
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Winner</label>
                <select value={resultData.winnerSide} onChange={(e) => setResultData((p) => ({ ...p, winnerSide: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm">
                  <option value="">Select winner</option>
                  <option value="home">{selectedMatch?.player1_name || `Player #${selectedMatch?.player1_id}`} (Home)</option>
                  <option value="away">{selectedMatch?.player2_name || `Player #${selectedMatch?.player2_id}`} (Away)</option>
                </select>
              </div>
            )}

            {resultData.outcome === 'completed' && selectedMatch?.rule_snapshot && (() => {
              const ruleSnap = typeof selectedMatch.rule_snapshot === 'string' ? JSON.parse(selectedMatch.rule_snapshot) : selectedMatch.rule_snapshot;
              if (ruleSnap?.score_structure === 'goals') {
                return (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Home Goals</label>
                      <input type="number" min={0} value={resultData.homeGoals} onChange={(e) => setResultData((p) => ({ ...p, homeGoals: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Away Goals</label>
                      <input type="number" min={0} value={resultData.awayGoals} onChange={(e) => setResultData((p) => ({ ...p, awayGoals: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm" />
                    </div>
                  </div>
                );
              }
              return (
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Sets</label>
                  {resultData.sets.map((s, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input type="number" min={0} value={s.home} placeholder="Home"
                        onChange={(e) => setResultData((p) => ({ ...p, sets: p.sets.map((x, i) => (i === idx ? { ...x, home: e.target.value } : x)) }))}
                        className="flex-1 px-2 py-1 border rounded text-sm" />
                      <span>-</span>
                      <input type="number" min={0} value={s.away} placeholder="Away"
                        onChange={(e) => setResultData((p) => ({ ...p, sets: p.sets.map((x, i) => (i === idx ? { ...x, away: e.target.value } : x)) }))}
                        className="flex-1 px-2 py-1 border rounded text-sm" />
                      <button type="button" onClick={() => setResultData((p) => ({ ...p, sets: p.sets.filter((_, i) => i !== idx) }))}
                        className="text-xs text-red-500 px-1">X</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setResultData((p) => ({ ...p, sets: [...p.sets, { home: '', away: '' }] }))}
                    className="text-xs text-[var(--color-primary)]">+ Add set</button>
                </div>
              );
            })()}

            <button onClick={saveResult}
              className="w-full px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium">
              {t('tournaments.save_result')}
            </button>
          </div>
        </Modal>
      </div>
    </Can>
  );
}