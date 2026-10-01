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
export default function PlayerTeamPage() {
  const { id } = useParams<{ id: string }>();
  const tid = Number(id);
  const qc = useQueryClient();
  const { showToast } = useToast();
  const { can } = useCan();
  const [teamName, setTeamName] = useState('');
  const [inviteUserId, setInviteUserId] = useState('');

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
    mutationFn: (pid: number) => tournamentTeamApi.invite(tid, pid, Number(inviteUserId)),
    onSuccess: () => { setInviteUserId(''); showToast('Invitation sent'); invalidate(); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Invitation failed', 'error'),
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
            <div className="flex gap-2 mt-3">
              <Input value={inviteUserId} onChange={(e) => setInviteUserId(e.target.value)} placeholder="Player user id" type="number" />
              <Button loading={inviteMutation.isPending} onClick={() => inviteMutation.mutate(Number(t.id))}>Invite</Button>
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