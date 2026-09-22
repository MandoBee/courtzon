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
  const { t } = useTranslation();
  const { showToast } = useToast();
  const qc = useQueryClient();

  const isOrg = mode === 'org';
  const api = isOrg && orgId ? orgTournamentParticipantApi : tournamentParticipantApi;
  const wrap = (fn: (...a: any[]) => any, ...a: any[]) => (isOrg && orgId ? fn(orgId, ...a) : fn(...a));

  const [seedTarget, setSeedTarget] = useState<{ participantId: number; seedNumber: string; source: 'rating' | 'manual'; reason: string } | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<{ withdrawnId: number; replacementId: number } | null>(null);
  // Group 7 state
  const [createTarget, setCreateTarget] = useState<{ type: 'pair' | 'team' } | null>(null);
  const [addMemberTarget, setAddMemberTarget] = useState<{ participantId: number } | null>(null);
  const [requestTarget, setRequestTarget] = useState<{ participantId: number; members: Member[] } | null>(null);

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
    qc.invalidateQueries({ queryKey: ['tournament-replacement-requests', tournamentId] });
  };

  const { data: waitlistData } = useQuery({
    queryKey: ['tournament-waitlist', tournamentId],
    queryFn: () => wrap(api.getWaitlist, tournamentId),
  });
  const waitlist = Array.isArray(waitlistData) ? waitlistData : [];

  const { data: replacementData } = useQuery({
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

  // ── Group 7 mutations ──

  const createPairTeam = useMutation({
    mutationFn: () => {
      const type = createTarget!.type;
      const memberIds = (type === 'pair' ? createPairMemberIds : createTeamMemberIds).filter((s) => s.trim()).map(Number);
      const payload = { name: createPairTeamName || undefined, member_user_ids: memberIds };
      return type === 'team'
        ? wrap(api.createTeamParticipant, tournamentId, payload)
        : wrap(api.createPairParticipant, tournamentId, payload);
    },
    onSuccess: () => { showToast(t('tournaments.participant_created', 'Participant created'), 'success'); setCreateTarget(null); setCreatePairTeamName(''); setCreatePairMemberIds(['', '']); setCreateTeamMemberIds(['', '', '']); invalidate(); },
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
  const [createPairMemberIds, setCreatePairMemberIds] = useState(['', '']);
  const [createTeamMemberIds, setCreateTeamMemberIds] = useState(['', '', '', '', '']);
  const [addMemberUserId, setAddMemberUserId] = useState('');
  const [requestOutgoingUserId, setRequestOutgoingUserId] = useState('');
  const [requestReplacementUserId, setRequestReplacementUserId] = useState('');
  const [requestReason, setRequestReason] = useState('');

  if (isLoading) return <div className="p-6"><SkeletonRow count={4} /></div>;

  const drawStatus = draw?.status ?? '—';
  const drawEntries = Array.isArray(draw?.entries) ? draw.entries : [];

  const managePerm = isOrg && orgId ? 'org.tournaments.manage' : 'tournaments.manage';

  const memberList = (p: any): Member[] => (Array.isArray(p?.members) ? p.members.filter((m: any) => m.status === 'active') : []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--color-text)]">{t('tournaments.participants', 'Participants & Seeding')}</h1>
        <div className="flex gap-2">
          <Can permission={managePerm}>
            <button onClick={() => setCreateTarget({ type: 'pair' })}
              className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white">
              {t('tournaments.create_pair', 'Add Pair')}
            </button>
            <button onClick={() => setCreateTarget({ type: 'team' })}
              className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] border border-[var(--color-primary)] text-[var(--color-primary)]">
              {t('tournaments.create_team', 'Add Team')}
            </button>
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
                      {p.status === 'withdrawn' && waitlist.length > 0 && (
                        <button onClick={() => setReplaceTarget({ withdrawnId: p.id, replacementId: waitlist[0].id })}
                          className="text-xs text-[var(--color-primary)] hover:underline">
                          Replace
                        </button>
                      )}
                    </Can>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Group 7 — pending replacement requests */}
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-hidden">
        <div className="flex items-center justify-between p-4">
          <h2 className="text-sm font-semibold">{t('tournaments.replacement_requests', 'Replacement Requests')} ({replacementRequests.length})</h2>
          <p className="text-[11px] text-[var(--color-text-muted)]">{t('tournaments.replacement_seed_hint', 'Replacing a member does not change the team\'s/pair\'s Tournament Seed.')}</p>
        </div>
        {replacementRequests.length === 0 ? (
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

      {/* Group 6 — FIFO waitlist */}
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-hidden">
        <div className="flex items-center justify-between p-4">
          <h2 className="text-sm font-semibold">{t('tournaments.waitlist', 'Waitlist')} ({waitlist.length})</h2>
          <Can permission={managePerm}>
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

      {/* Group 7 — create pair/team */}
      {createTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setCreateTarget(null)}>
          <div className="w-full max-w-md bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold">{createTarget.type === 'pair' ? t('tournaments.create_pair', 'Add Pair') : t('tournaments.create_team', 'Add Team')}</h3>
            <p className="text-xs text-[var(--color-text-muted)]">{t('tournaments.create_members_hint', 'Enter the player user IDs for this participant. One tournament entry — one payment. The sport/format roster size is enforced server-side.')}</p>
            <label className="block text-xs font-medium text-[var(--color-text-muted)]">Name</label>
            <input value={createPairTeamName} onChange={(e) => setCreatePairTeamName(e.target.value)}
              placeholder={createTarget.type === 'pair' ? 'Pair name' : 'Team name'} className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm" />
            <label className="block text-xs font-medium text-[var(--color-text-muted)]">Member user IDs</label>
            {(createTarget.type === 'pair' ? createPairMemberIds : createTeamMemberIds).map((v, i) => (
              <input key={i} type="number" value={v} onChange={(e) => {
                if (createTarget.type === 'pair') {
                  const next = [...createPairMemberIds]; next[i] = e.target.value; setCreatePairMemberIds(next);
                } else {
                  const next = [...createTeamMemberIds]; next[i] = e.target.value; setCreateTeamMemberIds(next);
                }
              }} placeholder={`Player user ID ${i + 1}`} className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm" />
            ))}
            <button onClick={() => createPairTeam.mutate()} disabled={createPairTeam.isPending}
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