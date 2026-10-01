import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useTranslation } from '../../../i18n';
import { tournamentApi, tournamentParticipantApi } from '../../../services/tournament';
import { Button, Card } from '../../../components/ui';
import { Can } from '../../../permissions/Can';
import { useCan } from '../../../hooks/useCan';
import { useToast } from '../../../components/ui/Toast';

interface AwardRow {
  id: number;
  tournament_id: number;
  prize_id: number;
  placement: number | null;
  registration_id: number;
  winner_user_id: number;
  winner_name?: string | null;
  amount: string | number;
  currency_code: string;
  funding_source: 'organization';
  collection_method: 'card' | 'cash';
  status: 'awarded' | 'credited' | 'refunded';
  bind_source: string;
  created_at?: string;
}

interface AwardablePrizeRow {
  id: number;
  placement: number | null;
  prize_type: string;
  description?: string | null;
  amount: string | number | null;
  currency_code?: string | null;
}

interface ParticipantRow {
  id: number;
  registration_id: number;
  name?: string | null;
  member_user_ids?: number[] | string | null;
  participant_type?: string;
  status?: string;
}

/**
 * G11.5 — Tournament Prize Award management (G11 Phase 4 build-out).
 *
 * Uses the EXISTING backend award routes (guarded by tournaments.awards.view/
 * grant/refund) and the EXISTING award service behaviour (manualGrant /
 * refundAward) — no new prize accounting was invented. Granting is restricted
 * to registered participants of the selected tournament; refunds use the
 * existing full-clawback flow (credited → refunded).
 */
export default function TournamentAwardsPage({ tournamentId }: { tournamentId?: number }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const { can } = useCan();
  const params = useParams<{ id: string }>();
  const tid = tournamentId ?? Number(params.id);
  const tournamentIdSafe = Number.isFinite(tid) ? tid : NaN;
  // G11.14 — page-level RBAC: award FUND data is only fetched/rendered for
  // holders of tournaments.awards.view (grant/refund stay additionally gated).
  const canViewAwards = can('tournaments.awards.view');

  const { data: tournament } = useQuery({
    queryKey: ['admin-tournament', tournamentIdSafe],
    queryFn: () => tournamentApi.getTournament(tournamentIdSafe),
    enabled: Number.isFinite(tournamentIdSafe),
  });

  const { data: awardsData } = useQuery({
    queryKey: ['tournament-awards', tournamentIdSafe],
    queryFn: () => tournamentApi.getPrizeAwards(tournamentIdSafe),
    enabled: Number.isFinite(tournamentIdSafe) && canViewAwards,
  });
  const awards: AwardRow[] = Array.isArray(awardsData) ? awardsData : (awardsData?.data ?? []);

  const { data: prizesData } = useQuery({
    queryKey: ['tournament-awardable-prizes', tournamentIdSafe],
    queryFn: () => tournamentApi.getAwardablePrizes(tournamentIdSafe),
    enabled: Number.isFinite(tournamentIdSafe) && canViewAwards,
  });
  const prizes: AwardablePrizeRow[] = Array.isArray(prizesData) ? prizesData : (prizesData?.data ?? []);

  const { data: participantsData } = useQuery({
    queryKey: ['tournament-participants', tournamentIdSafe],
    queryFn: () => tournamentParticipantApi.getParticipants(tournamentIdSafe),
    enabled: Number.isFinite(tournamentIdSafe),
  });
  const participants: ParticipantRow[] = Array.isArray(participantsData) ? participantsData : (participantsData?.data ?? []);

  // Winner options = member user ids of registered participants (deduped).
  const winnerOptions = useMemo(() => {
    const seen = new Set<number>();
    const out: { userId: number; label: string }[] = [];
    for (const p of participants) {
      const members: number[] = Array.isArray(p.member_user_ids)
        ? p.member_user_ids
        : typeof p.member_user_ids === 'string'
          ? (() => { try { return JSON.parse(p.member_user_ids); } catch { return []; } })()
          : [];
      for (const uid of members) {
        if (!seen.has(uid)) {
          seen.add(uid);
          out.push({ userId: uid, label: `${p.name ?? `User ${uid}`} (${uid})` });
        }
      }
    }
    return out;
  }, [participants]);

  const [prizeId, setPrizeId] = useState('');
  const [winnerUserId, setWinnerUserId] = useState('');

  const grantMutation = useMutation({
    mutationFn: ({ prizeId: pr, winnerUserId: wu }: { prizeId: number; winnerUserId: number }) =>
      tournamentApi.grantPrizeAward(tournamentIdSafe, pr, wu),
    onSuccess: () => {
      showToast(t('tournaments.awards.granted', 'Prize awarded'));
      setPrizeId(''); setWinnerUserId('');
      qc.invalidateQueries({ queryKey: ['tournament-awards', tournamentIdSafe] });
      qc.invalidateQueries({ queryKey: ['tournament-finances', tournamentIdSafe] });
    },
    onError: (err) => showToast(`Award failed: ${(err as any).message}`, 'error'),
  });

  const refundMutation = useMutation({
    mutationFn: ({ awardId, reason }: { awardId: number; reason?: string }) =>
      tournamentApi.refundPrizeAward(awardId, reason),
    onSuccess: () => {
      showToast(t('tournaments.awards.refunded', 'Prize refunded (full clawback)'));
      qc.invalidateQueries({ queryKey: ['tournament-awards', tournamentIdSafe] });
      qc.invalidateQueries({ queryKey: ['tournament-finances', tournamentIdSafe] });
    },
    onError: (err) => showToast(`Refund failed: ${(err as any).message}`, 'error'),
  });

  const canGrant = prizeId && winnerUserId;
  const onGrant = () => {
    if (!canGrant) return;
    grantMutation.mutate({ prizeId: Number(prizeId), winnerUserId: Number(winnerUserId) });
  };

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-6">
        {t('tournaments.awards.title', 'Tournament Prize Awards')}
      </h1>
      <div className="mb-6 text-sm text-[var(--color-text-muted)]">
        {tournament?.name ?? '—'}
        {tournament?.currency_code ? ` · ${tournament.currency_code}` : ''}
      </div>

      <Can permission="tournaments.awards.grant">
        <Card className="p-4 mb-6">
          <h3 className="font-semibold text-[var(--color-text)] mb-3">
            {t('tournaments.awards.grant_title', 'Grant prize to a participant')}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
                {t('tournaments.awards.prize', 'Prize')}
              </label>
              <select
                className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)]"
                value={prizeId}
                onChange={(e) => setPrizeId(e.target.value)}
              >
                <option value="">{t('tournaments.awards.select_prize', 'Select cash prize')}</option>
                {prizes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.placement != null ? `#${p.placement} ` : ''}
                    {p.description ?? 'Prize'} — {Number(p.amount ?? 0).toFixed(2)} {p.currency_code ?? ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
                {t('tournaments.awards.winner', 'Winner (registered participant)')}
              </label>
              <select
                className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)]"
                value={winnerUserId}
                onChange={(e) => setWinnerUserId(e.target.value)}
              >
                <option value="">{t('tournaments.awards.select_winner', 'Select participant')}</option>
                {winnerOptions.map((w) => (
                  <option key={w.userId} value={w.userId}>{w.label}</option>
                ))}
              </select>
            </div>
            <Button onClick={onGrant} loading={grantMutation.isPending} disabled={!canGrant}>
              {t('tournaments.awards.grant', 'Grant prize')}
            </Button>
          </div>
        </Card>
      </Can>

      <Can permission="tournaments.awards.view">
        <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className="text-left px-4 py-3">Placement</th>
              <th className="text-left px-4 py-3">Winner</th>
              <th className="text-left px-4 py-3">Amount</th>
              <th className="text-left px-4 py-3">Method</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Source</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {awards.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-sm text-[var(--color-text-muted)]">
                {t('tournaments.awards.empty', 'No prize awards yet.')}
              </td></tr>
            )}
            {awards.map((a) => (
              <tr key={a.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg)]/30">
                <td className="px-4 py-3">{a.placement ?? '—'}</td>
                <td className="px-4 py-3">{a.winner_name ?? `User ${a.winner_user_id}`}</td>
                <td className="px-4 py-3 font-mono">{Number(a.amount ?? 0).toFixed(2)} {a.currency_code}</td>
                <td className="px-4 py-3 capitalize">{a.collection_method}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${
                    a.status === 'credited' ? 'bg-green-100 text-green-700'
                    : a.status === 'refunded' ? 'bg-gray-100 text-gray-500'
                    : 'bg-yellow-100 text-yellow-700'
                  }`}>{a.status}</span>
                </td>
                <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{a.bind_source}</td>
                <td className="px-4 py-3 text-right">
                  <Can permission="tournaments.awards.refund">
                    {a.status === 'credited' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={refundMutation.isPending}
                        disabled={refundMutation.isPending}
                        onClick={() => refundMutation.mutate({ awardId: a.id, reason: 'Refunded from Tournament Awards' })}
                      >
                        {t('tournaments.awards.refund', 'Refund')}
                      </Button>
                    )}
                  </Can>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      </Can>
    </div>
  );
}