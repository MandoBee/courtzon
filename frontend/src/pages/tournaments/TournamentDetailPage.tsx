import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { Skeleton, SkeletonRow } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { Can } from '../../permissions/Can';

type Tab = 'overview' | 'bracket' | 'standings' | 'players';

export default function TournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const [scoreForm, setScoreForm] = useState<{ matchId: number; winnerId: number; score: string } | null>(null);

  const { data: tournament, isLoading } = useQuery({
    queryKey: ['tournament', id],
    queryFn: () => api.get(`/tournaments/${id}`).then(r => r.data.data || r.data),
  });

  const { data: matches } = useQuery({
    queryKey: ['tournament', id, 'bracket'],
    queryFn: () => api.get(`/tournaments/${id}/bracket`).then(r => r.data.data),
  });

  const { data: standings } = useQuery({
    queryKey: ['tournament', id, 'standings'],
    queryFn: () => api.get(`/tournaments/${id}/standings`).then(r => r.data.data),
  });

  const { data: participants } = useQuery({
    queryKey: ['tournament', id, 'participants'],
    queryFn: () => api.get(`/tournaments/${id}/participants`).then(r => r.data.data),
  });

  const generateBracket = useMutation({
    mutationFn: () => api.post(`/admin/tournaments/${id}/generate-bracket`),
    onSuccess: () => { showToast('Bracket generated!', 'success'); qc.invalidateQueries({ queryKey: ['tournament', id] }); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed', 'error'),
  });

  const submitScore = useMutation({
    mutationFn: (data: { matchId: number; winnerId: number; score: string }) => api.post('/admin/tournaments/score', data),
    onSuccess: () => { showToast('Score updated!', 'success'); qc.invalidateQueries({ queryKey: ['tournament', id] }); setScoreForm(null); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed', 'error'),
  });

  if (isLoading) return <div className="space-y-4"><Skeleton width={300} height={28} /><SkeletonRow count={6} /></div>;
  if (!tournament) return <p className="text-[var(--color-text-muted)] text-center py-8">Tournament not found.</p>;

  const matchList = Array.isArray(matches) ? matches : [];
  const standingList = Array.isArray(standings) ? standings : [];
  const participantList = Array.isArray(participants) ? participants : [];

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/tournaments')} className="text-sm text-[var(--color-primary)] hover:underline">← Back to Tournaments</button>

      {/* Header */}
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text)]">{tournament.name}</h1>
            <p className="text-sm text-[var(--color-text-muted)] capitalize">{tournament.format} · {tournament.registration_type}</p>
          </div>
          <span className={`px-3 py-1 text-xs font-medium rounded-full capitalize ${
            tournament.status === 'in_progress' ? 'bg-green-100 text-green-700' :
            tournament.status === 'open' ? 'bg-blue-100 text-blue-700' :
            tournament.status === 'completed' ? 'bg-gray-100 text-gray-600' :
            'bg-yellow-100 text-yellow-700'}`}>{tournament.status}</span>
        </div>
        {tournament.description && <p className="text-sm text-[var(--color-text-muted)]">{tournament.description}</p>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span className="text-[var(--color-text-muted)]">Sport:</span> <span className="font-medium">#{tournament.sport_id}</span></div>
          <div><span className="text-[var(--color-text-muted)]">Players:</span> <span className="font-medium">{tournament.current_participants}/{tournament.max_participants}</span></div>
          <div><span className="text-[var(--color-text-muted)]">Start:</span> <span className="font-medium">{new Date(tournament.start_date).toLocaleDateString()}</span></div>
          <div><span className="text-[var(--color-text-muted)]">Duration:</span> <span className="font-medium">{tournament.match_duration_minutes}min</span></div>
        </div>
        {tournament.prize_description && <p className="text-sm font-medium text-yellow-600">🏆 {tournament.prize_description}</p>}
        {tournament.status === 'open' && !matchList.length && (
          <Can permission="tournaments.manage_brackets">
            <button onClick={() => generateBracket.mutate()} disabled={generateBracket.isPending} className="btn-primary text-sm">
              {generateBracket.isPending ? 'Generating...' : 'Generate Bracket & Start'}
            </button>
          </Can>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap">
        {(['overview', 'bracket', 'standings', 'players'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full ${tab === t ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-bg)] text-[var(--color-text-muted)]'}`}>
            {t === 'overview' ? 'Overview' : t === 'bracket' ? 'Bracket' : t === 'standings' ? 'Standings' : 'Players'}
          </button>
        ))}
      </div>

      {/* ELO / Awards section */}
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
        <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">ELO Ranking & Awards</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div><p className="text-xs text-[var(--color-text-muted)]">Top ELO</p><p className="text-lg font-bold text-[var(--color-text)]">—</p><p className="text-[10px] text-[var(--color-text-muted)]">After tournament</p></div>
          <div><p className="text-xs text-[var(--color-text-muted)]">Prize Pool</p><p className="text-lg font-bold text-yellow-600">{tournament.prize_description || '—'}</p></div>
          <div><p className="text-xs text-[var(--color-text-muted)]">Matches Played</p><p className="text-lg font-bold">{matchList.filter((m: any) => m.status === 'completed').length}</p></div>
          <div><p className="text-xs text-[var(--color-text-muted)]">Avg Match Duration</p><p className="text-lg font-bold">{tournament.match_duration_minutes}min</p></div>
        </div>
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
            <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Match Summary</h2>
            {matchList.length === 0 ? <p className="text-xs text-[var(--color-text-muted)]">No matches yet.</p> : (
              <div className="space-y-2">
                {matchList.map((m: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-[var(--color-border)] last:border-0">
                    <span>R{m.round} M{m.bracket_position}</span>
                    <span className="text-[var(--color-text-muted)]">P{m.player1_id || '—'} vs P{m.player2_id || '—'}</span>
                    <span className={`px-1.5 py-0.5 rounded ${m.status === 'completed' ? 'bg-green-100 text-green-700' : m.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{m.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
            <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Players</h2>
            {participantList.length === 0 ? <p className="text-xs text-[var(--color-text-muted)]">No participants yet.</p> : (
              <div className="flex flex-wrap gap-2">
                {participantList.map((p: any) => (
                  <span key={p.id} className="px-2 py-1 text-xs bg-[var(--color-bg)] rounded-full capitalize">{p.team_name || `Player #${p.user_id}`} <span className="text-[var(--color-text-muted)]">(seed {p.seed})</span></span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bracket Tab */}
      {tab === 'bracket' && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text)] mb-4">Bracket</h2>
          {matchList.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)] text-center py-8">Bracket not yet generated.</p>
          ) : (
            <div className="space-y-4">
              {Array.from(new Set(matchList.map((m: any) => m.round))).sort().map(round => (
                <div key={round}>
                  <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-2">Round {round}</h3>
                  <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
                    {matchList.filter((m: any) => m.round === round).map((m: any) => (
                      <div key={m.id} className="bg-[var(--color-bg)] rounded-lg p-3 space-y-2 border border-[var(--color-border)]">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium">{m.player1_id ? `P${m.player1_id}` : 'TBD'}</span>
                          {m.winner_id === m.player1_id && <span className="text-green-600">✓</span>}
                        </div>
                        <div className="text-center text-xs text-[var(--color-text-muted)]">vs</div>
                        <div className="flex justify-between text-xs">
                          <span className="font-medium">{m.player2_id ? `P${m.player2_id}` : 'TBD'}</span>
                          {m.winner_id === m.player2_id && <span className="text-green-600">✓</span>}
                        </div>
                        {m.score && <div className="text-center text-xs font-medium">{m.score}</div>}
                        <div className="flex justify-between items-center mt-1">
                          <span className={`text-[10px] px-1 py-0.5 rounded ${m.status === 'completed' ? 'bg-green-100 text-green-700' : m.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{m.status}</span>
                          <Can permission="tournaments.enter_scores">
                            {m.status !== 'completed' && (
                              <button onClick={() => setScoreForm({ matchId: m.id, winnerId: 0, score: '' })}
                                className="text-[10px] text-[var(--color-primary)] hover:underline">Enter Score</button>
                            )}
                          </Can>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Score Entry Modal */}
      {scoreForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setScoreForm(null)}>
          <div className="bg-[var(--color-surface)] rounded-xl p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold">Enter Score — Match #{scoreForm.matchId}</h3>
            <div><label className="text-xs text-[var(--color-text-muted)]">Winner ID</label><input type="number" value={scoreForm.winnerId} onChange={e => setScoreForm({...scoreForm, winnerId: Number(e.target.value)})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
            <div><label className="text-xs text-[var(--color-text-muted)]">Score (e.g. 6-4)</label><input value={scoreForm.score} onChange={e => setScoreForm({...scoreForm, score: e.target.value})} className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" /></div>
            <div className="flex gap-2">
              <button onClick={() => setScoreForm(null)} className="flex-1 py-2 text-sm border border-[var(--color-border)] rounded-lg">Cancel</button>
              <button onClick={() => submitScore.mutate(scoreForm)} disabled={!scoreForm.winnerId || !scoreForm.score} className="flex-1 py-2 text-sm text-white bg-[var(--color-primary)] rounded-lg disabled:opacity-50">Submit</button>
            </div>
          </div>
        </div>
      )}

      {/* Standings Tab */}
      {tab === 'standings' && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
          <h2 className="text-sm font-semibold text-[var(--color-text)] p-5 pb-0">Standings</h2>
          {standingList.length === 0 ? (
            <p className="p-5 text-xs text-[var(--color-text-muted)]">No standings available yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)] text-xs">
                <th className="text-left px-4 py-3">#</th><th className="text-left px-4 py-3">Player</th><th className="text-center px-2 py-3">Pts</th><th className="text-center px-2 py-3">W</th><th className="text-center px-2 py-3">L</th><th className="text-center px-2 py-3">GF</th><th className="text-center px-2 py-3">GA</th>
              </tr></thead>
              <tbody>{standingList.map((s: any, i: number) => (
                <tr key={i} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2 text-xs font-bold">{s.position}</td>
                  <td className="px-4 py-2 text-xs font-medium">Player #{s.participantId}</td>
                  <td className="px-2 py-2 text-xs text-center font-bold">{s.points}</td>
                  <td className="px-2 py-2 text-xs text-center text-green-600">{s.wins}</td>
                  <td className="px-2 py-2 text-xs text-center text-red-600">{s.losses}</td>
                  <td className="px-2 py-2 text-xs text-center">{s.gamesFor}</td>
                  <td className="px-2 py-2 text-xs text-center">{s.gamesAgainst}</td>
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
          {participantList.length === 0 ? (
            <p className="p-5 text-xs text-[var(--color-text-muted)]">No participants yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)] text-xs">
                <th className="text-left px-4 py-3">Seed</th><th className="text-left px-4 py-3">Player</th><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Registered</th>
              </tr></thead>
              <tbody>{participantList.map((p: any) => (
                <tr key={p.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2 text-xs font-bold">#{p.seed}</td>
                  <td className="px-4 py-2 text-xs">{p.team_name || `Player #${p.user_id}`}</td>
                  <td className="px-4 py-2 text-xs capitalize">{p.status}</td>
                  <td className="px-4 py-2 text-xs text-[var(--color-text-muted)]">{new Date(p.registered_at).toLocaleDateString()}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
