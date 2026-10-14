import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { tournamentTeamApi } from '../../services/tournament';
import { useCan } from '../../hooks/useCan';
import { Button, Card, Input } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

/**
 * G11.17 — Player team self-service (non-financial).
 * Create a team, view your roster, invite players, accept/reject invitations,
 * and join an open team — all within the existing tournament team rules.
 */
/**
 * Phase 3 — the captain's outgoing invitations for one team, with the ability to
 * CANCEL a still-pending invitation. Server-authoritative: the button is a
 * convenience; the backend enforces captain-only + pending-only cancellation.
 */
function SentInvitations({
  tournamentId,
  participantId,
  onCancel,
  cancelling,
}: {
  tournamentId: number;
  participantId: number;
  onCancel: (invitationId: number) => void;
  cancelling: boolean;
}) {
  const sentQuery = useQuery({
    queryKey: ['team-invitations-sent', tournamentId, participantId],
    queryFn: () => tournamentTeamApi.listSent(tournamentId, participantId),
    enabled: Number.isFinite(tournamentId) && Number.isFinite(participantId),
  });
  const sent = (sentQuery.data || []) as any[];
  if (sent.length === 0) return null;
  const statusStyles: Record<string, string> = {
    pending: 'text-[var(--color-text-muted)]',
    accepted: 'text-[var(--color-success,#16a34a)]',
    rejected: 'text-[var(--color-danger,#dc2626)]',
    expired: 'text-[var(--color-text-muted)]',
  };
  return (
    <ul className="space-y-1 pt-1">
      {sent.map((inv: any) => (
        <li key={inv.id} className="flex items-center justify-between text-sm text-[var(--color-text)]">
          <span>
            {inv.invitee_name || `Player #${inv.invitee_user_id}`}{' '}
            <span className={statusStyles[inv.status] || ''}>({inv.status})</span>
          </span>
          {inv.status === 'pending' && (
            <Button size="sm" variant="secondary" loading={cancelling} onClick={() => onCancel(Number(inv.id))}>
              Cancel
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function PlayerTeamPage() {
  const { id } = useParams<{ id: string }>();
  const tid = Number(id);
  const qc = useQueryClient();
  const { showToast } = useToast();
  const { can } = useCan();
  const [teamName, setTeamName] = useState('');
  const [invitePhone, setInvitePhone] = useState('');

  const teamQuery = useQuery({
    queryKey: ['tournament-teams', tid],
    queryFn: () => tournamentTeamApi.listTeams(tid),
    enabled: Number.isFinite(tid),
  });

  const invitesQuery = useQuery({
    queryKey: ['team-invitations-mine'],
    queryFn: () => tournamentTeamApi.listMine(),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['tournament-teams', tid] });
    qc.invalidateQueries({ queryKey: ['team-invitations-mine'] });
    qc.invalidateQueries({ queryKey: ['tournament', tid, 'participants'] });
  };

  const createMutation = useMutation({
    mutationFn: () => tournamentTeamApi.createTeam(tid, { name: teamName }),
    onSuccess: () => { setTeamName(''); showToast('Team created'); invalidate(); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to create team', 'error'),
  });
  const joinMutation = useMutation({
    mutationFn: (pid: number) => tournamentTeamApi.joinTeam(tid, pid),
    onSuccess: () => { showToast('Joined the team'); invalidate(); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Cannot join', 'error'),
  });
  const inviteMutation = useMutation({
    mutationFn: (pid: number) => tournamentTeamApi.invite(tid, pid, { inviteePhone: invitePhone.trim() }),
    onSuccess: () => { setInvitePhone(''); showToast('Invitation sent'); invalidate(); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Invitation failed', 'error'),
  });
  const cancelMutation = useMutation({
    mutationFn: ({ tournamentId, invitationId }: { tournamentId: number; invitationId: number }) =>
      tournamentTeamApi.cancel(tournamentId, invitationId),
    onSuccess: () => { showToast('Invitation cancelled'); invalidate(); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to cancel invitation', 'error'),
  });
  const respondMutation = useMutation({
    mutationFn: ({ inv, accept }: { inv: any; accept: boolean }) =>
      accept ? tournamentTeamApi.accept(inv.tournament_id, inv.id) : tournamentTeamApi.reject(inv.tournament_id, inv.id),
    onSuccess: () => { showToast('Invitation updated'); invalidate(); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to update invitation', 'error'),
  });

  const mine = teamQuery.data?.mine || [];
  const joinable = teamQuery.data?.joinable || [];
  const pending = (invitesQuery.data || []).filter((i: any) => i.status === 'pending');

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-xl font-bold text-[var(--color-text)]">My Teams</h1>

      {can('player.tournaments.team.create') && (
        <Card>
          <h2 className="font-semibold text-[var(--color-text)] mb-3">Create a Team</h2>
          <div className="flex gap-2">
            <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Team name" />
            <Button loading={createMutation.isPending} onClick={() => createMutation.mutate()}>Create</Button>
          </div>
        </Card>
      )}

      {mine.map((t: any) => (
        <Card key={t.id}>
          <h3 className="font-semibold text-[var(--color-text)]">{t.name || `Team #${t.id}`}</h3>
          {can('player.tournaments.team.invite') && (
            <div className="space-y-2 mt-3">
              <div className="flex gap-2">
                <Input value={invitePhone} onChange={(e) => setInvitePhone(e.target.value)} placeholder="Partner phone number" type="tel" />
                <Button loading={inviteMutation.isPending} onClick={() => inviteMutation.mutate(Number(t.id))}>Invite</Button>
              </div>
              <SentInvitations
                tournamentId={tid}
                participantId={Number(t.id)}
                onCancel={(invitationId) => cancelMutation.mutate({ tournamentId: tid, invitationId })}
                cancelling={cancelMutation.isPending}
              />
            </div>
          )}
        </Card>
      ))}

      {can('player.tournaments.team.join') && joinable.length > 0 && (
        <Card>
          <h2 className="font-semibold text-[var(--color-text)] mb-3">Join a Team</h2>
          <ul className="space-y-2">
            {joinable.map((t: any) => (
              <li key={t.id} className="flex items-center justify-between">
                <span className="text-sm text-[var(--color-text)]">{t.name || `Team #${t.id}`} ({t.memberCount}/{t.rosterSize ?? 2})</span>
                <Button size="sm" variant="secondary" loading={joinMutation.isPending} onClick={() => joinMutation.mutate(t.id)}>Join</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {pending.length > 0 && (
        <Card>
          <h2 className="font-semibold text-[var(--color-text)] mb-3">Pending Invitations</h2>
          <ul className="space-y-2">
            {pending.map((inv: any) => (
              <li key={inv.id} className="text-sm text-[var(--color-text)]">
                {inv.team_name || 'Team'} · {inv.tournament_name || `Tournament #${inv.tournament_id}`}
                <span className="ml-3">
                  <Button size="sm" loading={respondMutation.isPending} onClick={() => respondMutation.mutate({ inv, accept: true })}>Accept</Button>{' '}
                  <Button size="sm" variant="secondary" onClick={() => respondMutation.mutate({ inv, accept: false })}>Reject</Button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!Number.isFinite(tid) && <p className="text-sm text-[var(--color-text-muted)]">Select a tournament.</p>}
    </div>
  );
}