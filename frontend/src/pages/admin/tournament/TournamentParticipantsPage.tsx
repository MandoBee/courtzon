import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../../../i18n';
import { useToast } from '../../../components/ui/Toast';
import { Can } from '../../../permissions/Can';
import { SkeletonRow } from '../../../components/ui/Skeleton';
import { tournamentParticipantApi, orgTournamentParticipantApi } from '../../../services/tournament';
import { getErrorMessage } from '../../../utils/errors';

export type TournamentParticipantsContextMode = 'admin' | 'org';

interface Props {
  mode?: TournamentParticipantsContextMode;
  orgId?: string;
}

/**
 * Group 5 — Participants & Seeding foundation screen (admin + org).
 * Lists the authoritative participants with their global rating (display only),
 * tournament seed and seed source; supports manual seeding, draw generation /
 * re-generation, validation, approval and locking. The full Draw UI (drag &
 * drop bracket) is intentionally NOT built yet — this establishes the API +
 * domain contract the future screen consumes.
 */
export default function TournamentParticipantsPage({ mode = 'admin', orgId: orgIdProp }: Props) {
  const params = useParams<{ id: string; orgId?: string }>();
  const tournamentId = Number(params.id);
  const orgId = orgIdProp ?? params.orgId;
  const { t } = useTranslation();
  const { showToast } = useToast();
  const qc = useQueryClient();

  const isOrg = mode === 'org';
  const api = isOrg && orgId ? orgTournamentParticipantApi : tournamentParticipantApi;
  const wrap = (fn: (...a: any[]) => any, ...a: any[]) => (isOrg && orgId ? fn(orgId, ...a) : fn(...a));

  const [seedTarget, setSeedTarget] = useState<{ participantId: number; seedNumber: string; source: 'rating' | 'manual'; reason: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['tournament-participants', tournamentId],
    queryFn: () => wrap(api.getParticipants, tournamentId),
  });
  const participants = Array.isArray(data) ? data : [];

  const { data: draw } = useQuery({
    queryKey: ['tournament-draw', tournamentId],
    queryFn: () => wrap(api.getCurrentDraw, tournamentId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['tournament-participants', tournamentId] });
    qc.invalidateQueries({ queryKey: ['tournament-waitlist', tournamentId] });
    qc.invalidateQueries({ queryKey: ['tournament-draw', tournamentId] });
  };

  const { data: waitlistData } = useQuery({
    queryKey: ['tournament-waitlist', tournamentId],
    queryFn: () => wrap(api.getWaitlist, tournamentId),
  });
  const waitlist = Array.isArray(waitlistData) ? waitlistData : [];

  const [replaceTarget, setReplaceTarget] = useState<{ withdrawnId: number; replacementId: number } | null>(null);

  const withdraw = useMutation({
    mutationFn: (participantId: number) => wrap(api.withdrawParticipant, tournamentId, participantId),
    onSuccess: () => { showToast(t('tournaments.participant_withdrawn', 'Participant withdrawn'), 'success'); invalidate(); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const promote = useMutation({
    mutationFn: () => wrap(api.promoteNextWaitlisted, tournamentId),
    onSuccess: () => { showToast(t('tournaments.waitlist_promoted', 'Waitlisted participant promoted'), 'success'); invalidate(); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const replace = useMutation({
    mutationFn: () => wrap(api.replaceParticipant, tournamentId, replaceTarget!.withdrawnId, replaceTarget!.replacementId),
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
    mutationFn: () => wrap(api.generateDraw, tournamentId),
    onSuccess: () => { showToast(t('tournaments.draw_generated', 'Draw generated'), 'success'); invalidate(); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const approveDraw = useMutation({
    mutationFn: () => wrap(api.approveDraw, tournamentId),
    onSuccess: () => { showToast(t('tournaments.draw_approved', 'Draw approved'), 'success'); invalidate(); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const lockDraw = useMutation({
    mutationFn: () => wrap(api.lockDraw, tournamentId),
    onSuccess: () => { showToast(t('tournaments.draw_locked', 'Draw locked'), 'success'); invalidate(); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  if (isLoading) return <div className="p-6"><SkeletonRow count={4} /></div>;

  const drawStatus = draw?.status ?? '—';
  const drawEntries = Array.isArray(draw?.entries) ? draw.entries : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--color-text)]">{t('tournaments.participants', 'Participants & Seeding')}</h1>
        <div className="flex gap-2">
          <Can permission={isOrg && orgId ? 'org.tournaments.manage' : 'tournaments.manage'}>
            <button onClick={() => generateDraw.mutate()} disabled={generateDraw.isPending || drawStatus === 'locked'}
              className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white disabled:opacity-50">
              {draw ? 'Re-Draw' : 'Generate Draw'}
            </button>
            <button onClick={() => approveDraw.mutate()} disabled={approveDraw.isPending || drawStatus !== 'draft'}
              className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] border border-green-300 text-green-700 disabled:opacity-50">
              Approve
            </button>
            <button onClick={() => lockDraw.mutate()} disabled={lockDraw.isPending || drawStatus !== 'approved'}
              className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] border border-amber-300 text-amber-700 disabled:opacity-50">
              Lock
            </button>
          </Can>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 text-sm">
        <span className="text-[var(--color-text-muted)]">Draw status:</span>{' '}
        <span className="font-semibold capitalize">{drawStatus}</span>
        {draw?.attempt_number ? <span className="text-[var(--color-text-muted)]"> • attempt #{draw.attempt_number}</span> : null}
      </div>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-[var(--color-text-muted)]">
              <th className="text-left px-4 py-3">Player</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Global Rating</th>
              <th className="text-left px-4 py-3">Tournament Seed</th>
              <th className="text-left px-4 py-3">Source</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p: any) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="px-4 py-2 font-medium">{p.display_name || `Player #${p.player_id}`}</td>
                <td className="px-4 py-2 capitalize">{p.status || 'active'}</td>
                <td className="px-4 py-2">{p.global_rating != null ? `${p.global_rating}%` : '—'}</td>
                <td className="px-4 py-2 font-semibold">{p.seed ? `#${p.seed.seed_number}` : '—'}</td>
                <td className="px-4 py-2 capitalize">{p.seed ? p.seed.source : '—'}</td>
                <td className="px-4 py-2 text-right space-x-2">
                  <Can permission={isOrg && orgId ? 'org.tournaments.manage' : 'tournaments.manage'}>
                    <button onClick={() => setSeedTarget({ participantId: p.id, seedNumber: p.seed?.seed_number ?? '', source: p.seed?.source ?? 'manual', reason: '' })}
                      className="text-xs text-[var(--color-primary)] hover:underline">
                      {p.seed ? 'Change Seed' : 'Assign Seed'}
                    </button>
                    {p.status === 'active' && (
                      <button onClick={() => { if (window.confirm('Withdraw this participant before the tournament start?')) withdraw.mutate(p.id); }}
                        className="text-xs text-[var(--color-error)] hover:underline">
                        Withdraw
                      </button>
                    )}
                    {p.status === 'withdrawn' && waitlist.length > 0 && (
                      <button onClick={() => setReplaceTarget({ withdrawnId: p.id, replacementId: waitlist[0].id })}
                        className="text-xs text-[var(--color-primary)] hover:underline">
                        Replace
                      </button>
                    )}
                  </Can>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Group 6 — FIFO waitlist */}
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-hidden">
        <div className="flex items-center justify-between p-4">
          <h2 className="text-sm font-semibold">{t('tournaments.waitlist', 'Waitlist')} ({waitlist.length})</h2>
          <Can permission={isOrg && orgId ? 'org.tournaments.manage' : 'tournaments.manage'}>
            <button onClick={() => promote.mutate()} disabled={promote.isPending || waitlist.length === 0}
              className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white disabled:opacity-50">
              {t('tournaments.promote_next', 'Promote Next')}
            </button>
          </Can>
        </div>
        {waitlist.length === 0 ? (
          <p className="px-4 pb-4 text-xs text-[var(--color-text-muted)]">{t('tournaments.waitlist_empty', 'The waitlist is empty.')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b text-xs text-[var(--color-text-muted)]">
              <th className="text-left px-4 py-3">Order</th><th className="text-left px-4 py-3">Participant</th><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Payment</th>
            </tr></thead>
            <tbody>
              {waitlist.map((w: any) => (
                <tr key={w.id} className="border-b last:border-0">
                  <td className="px-4 py-2 font-bold">#{w.waiting_order ?? w.id}</td>
                  <td className="px-4 py-2">{w.display_name || `Player #${w.player_id}`}</td>
                  <td className="px-4 py-2 capitalize">{w.status}</td>
                  <td className="px-4 py-2">unpaid</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {drawEntries.length > 0 && (
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
    </div>
  );
}