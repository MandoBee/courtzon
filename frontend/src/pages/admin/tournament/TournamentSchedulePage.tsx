import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../../../i18n';
import { useToast } from '../../../components/ui/Toast';
import { Can } from '../../../permissions/Can';
import { SkeletonRow } from '../../../components/ui/Skeleton';
import { tournamentApi, orgTournamentApi, tournamentParticipantApi, orgTournamentParticipantApi } from '../../../services/tournament';
import { getErrorMessage } from '../../../utils/errors';

export type TournamentScheduleContextMode = 'admin' | 'org';
interface Props { mode?: TournamentScheduleContextMode; orgId?: string }

interface ScheduleTarget {
  matchId: number;
  date: string;
  start_time: string;
  end_time: string;
  resource_id: number;
}

/**
 * G8 — Matches & Schedule. Generate the authoritative match set from the
 * LOCKED draw, then schedule each real match on an eligible court within the
 * tournament window. Court reservation reuses the SHARED booking system
 * (conflicts with normal/academy bookings) and is NON-FINANCIAL.
 */
export default function TournamentSchedulePage({ mode = 'admin', orgId: orgIdProp }: Props) {
  const params = useParams<{ id: string; orgId?: string }>();
  const tournamentId = Number(params.id);
  const orgId = orgIdProp ?? params.orgId;
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const qc = useQueryClient();

  const isOrg = mode === 'org';
  const detailApi = isOrg && orgId ? orgTournamentApi : tournamentApi;
  const pApi = isOrg && orgId ? orgTournamentParticipantApi : tournamentParticipantApi;
  const wrap = (fn: (...a: any[]) => any, ...a: any[]) => (isOrg && orgId ? fn(orgId, ...a) : fn(...a));
  const managePerm = isOrg && orgId ? 'org.tournaments.manage' : 'tournaments.manage';

  const [scheduleTarget, setScheduleTarget] = useState<ScheduleTarget | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  const { data: tournament, isLoading: loadingT } = useQuery({
    queryKey: ['tournament', tournamentId],
    queryFn: () => wrap(detailApi.getTournament, tournamentId),
  });

  const { data: matchesData, isLoading: loadingM } = useQuery({
    queryKey: ['tournament-matches', tournamentId],
    queryFn: () => wrap(detailApi.getMatches, tournamentId),
  });
  const matches = Array.isArray(matchesData) ? matchesData : [];

  const { data: courtsData } = useQuery({
    queryKey: ['tournament-courts', tournamentId],
    queryFn: () => wrap(pApi.getEligibleCourts, tournamentId),
  });
  const courts = Array.isArray(courtsData) ? courtsData : [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['tournament-matches', tournamentId] });
    qc.invalidateQueries({ queryKey: ['tournament-courts', tournamentId] });
    qc.invalidateQueries({ queryKey: ['tournament-schedule', tournamentId] });
  };

  const generate = useMutation({
    mutationFn: () => wrap(pApi.generateMatches, tournamentId),
    onSuccess: (r: any) => { showToast(t('tournaments.matches_generated', 'Matches generated') + (r?.generated != null ? ` (${r.generated})` : ''), 'success'); invalidate(); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const autoSchedule = useMutation({
    mutationFn: () => wrap(pApi.autoSchedule, tournamentId),
    onSuccess: (r: any) => { showToast(t('tournaments.matches_auto_scheduled', 'Matches auto-scheduled') + (r?.scheduled != null ? ` (${r.scheduled})` : ''), 'success'); invalidate(); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const schedule = useMutation({
    mutationFn: () => wrap(pApi.scheduleMatch, tournamentId, scheduleTarget!.matchId, {
      date: scheduleTarget!.date,
      start_time: scheduleTarget!.start_time,
      end_time: scheduleTarget!.end_time,
      resource_id: scheduleTarget!.resource_id,
    }),
    onSuccess: () => { showToast(t('tournaments.match_scheduled', 'Match scheduled + court reserved'), 'success'); setShowScheduleModal(false); invalidate(); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const release = useMutation({
    mutationFn: (matchId: number) => wrap(pApi.releaseMatchCourt, tournamentId, matchId),
    onSuccess: () => { showToast(t('tournaments.court_released', 'Court reservation released'), 'success'); invalidate(); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  if (loadingT || loadingM) return <div className="p-6"><SkeletonRow count={4} /></div>;

  const today = new Date().toISOString().slice(0, 10);
  const hasMatches = matches.length > 0;

  const openSchedule = (m: any) => {
    setScheduleTarget({
      matchId: m.id,
      date: (m.start_time ? String(m.start_time).slice(0, 10) : today),
      start_time: (m.start_time ? String(m.start_time).slice(11, 16) : '09:00'),
      end_time: (m.start_time ? String(m.start_time).slice(11, 13) + ':00' : '10:00'),
      resource_id: Number(m.resource_id ?? courts[0]?.id ?? 0),
    });
    setShowScheduleModal(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">{t('tournaments.matches_schedule', 'Matches & Schedule')}</h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            {t('tournaments.schedule_window', 'Tournament window')}: {tournament?.start_date?.slice(0, 10)} → {tournament?.end_date?.slice(0, 10) || '—'} • {tournament?.daily_start_time ? String(tournament.daily_start_time).slice(0, 5) : '—'}–{tournament?.daily_end_time ? String(tournament.daily_end_time).slice(0, 5) : '—'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Can permission={managePerm}>
            <button onClick={() => generate.mutate()} disabled={generate.isPending || hasMatches}
              className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white disabled:opacity-50">
              {t('tournaments.generate_matches', 'Generate Matches (from Locked Draw)')}
            </button>
            <button onClick={() => autoSchedule.mutate()} disabled={autoSchedule.isPending || !hasMatches || courts.length === 0}
              className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] border border-[var(--color-primary)] text-[var(--color-primary)] disabled:opacity-50">
              {t('tournaments.auto_schedule', 'Auto Schedule')}
            </button>
            <button onClick={() => navigate(isOrg ? `/org/${orgId}/tournaments/${tournamentId}/draw` : `/admin/tournament/list/${tournamentId}/draw`)}
              className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)]">
              ← {t('tournaments.draw', 'Draw')}
            </button>
          </Can>
        </div>
      </div>

      {!hasMatches && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-5">
          <p className="text-sm text-[var(--color-text)]">{t('tournaments.no_matches_generated', 'No matches generated yet. Lock the draw, then generate the match set.')}</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">{t('tournaments.generate_hint', 'Only a LOCKED draw may produce the authoritative match schedule. Byes are created as bracket metadata — they never reserve a court.')}</p>
        </div>
      )}

      {hasMatches && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-[var(--color-text-muted)]">
                <th className="text-left px-4 py-3">{t('tournaments.match.round', 'Round')}</th>
                <th className="text-left px-4 py-3">{t('tournaments.match.match_no', 'No')}</th>
                <th className="text-left px-4 py-3">{t('tournaments.match.participant1', 'Side 1')}</th>
                <th className="text-left px-4 py-3">{t('tournaments.match.participant2', 'Side 2')}</th>
                <th className="text-left px-4 py-3">{t('tournaments.match.schedule', 'Schedule')}</th>
                <th className="text-left px-4 py-3">{t('tournaments.match.court', 'Court')}</th>
                <th className="text-left px-4 py-3">{t('tournaments.match.reservation', 'Reservation')}</th>
                <th className="text-right px-4 py-3">{t('common.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m: any) => {
                const isBye = m.match_id == null;
                return (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="px-4 py-3 text-xs">{m.round_name || m.round || '-'}</td>
                    <td className="px-4 py-3 font-mono text-xs">{m.match_number ?? m.match_no ?? '-'}</td>
                    <td className="px-4 py-3">{m.participant1_name || m.player1_name || (m.player1_id ? `Player #${m.player1_id}` : '—')}</td>
                    <td className="px-4 py-3">{m.participant2_name || m.player2_name || (m.player2_id ? `Player #${m.player2_id}` : '—')}</td>
                    <td className="px-4 py-3 text-xs">
                      {m.start_time ? new Date(String(m.start_time).replace(' ', 'T')).toLocaleString() : (isBye ? <span className="text-[var(--color-text-muted)]">bye</span> : '—')}
                    </td>
                    <td className="px-4 py-3 text-xs">{m.resource_name || (m.resource_id ? `Court #${m.resource_id}` : '—')}</td>
                    <td className="px-4 py-3 text-xs">
                      {isBye ? <span className="text-[var(--color-text-muted)]">—</span> : (m.booking_id ? <span className="text-green-600 font-medium">reserved</span> : <span className="text-[var(--color-text-muted)]">none</span>)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Can permission={managePerm}>
                        {!isBye && (
                          <>
                            <button onClick={() => openSchedule(m)} disabled={schedule.isPending}
                              className="text-xs text-[var(--color-primary)] hover:underline disabled:opacity-50">
                              {m.booking_id ? 'Re-schedule' : 'Schedule + Reserve'}
                            </button>
                            {m.booking_id && (
                              <button onClick={() => { if (window.confirm(t('tournaments.confirm_release', 'Release this court reservation?'))) release.mutate(m.id); }}
                                className="text-xs text-[var(--color-error)] hover:underline ml-2">
                                Release
                              </button>
                            )}
                          </>
                        )}
                      </Can>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {courts.length > 0 && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
          <h2 className="text-sm font-semibold mb-2">{t('tournaments.eligible_courts', 'Eligible Courts')}</h2>
          <div className="flex flex-wrap gap-2">
            {courts.map((c: any) => (
              <span key={c.id} className="px-2.5 py-1 rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] text-xs">
                {c.name} <span className="text-[var(--color-text-muted)]">({c.opening_time ? String(c.opening_time).slice(0, 5) : '—'}–{c.closing_time ? String(c.closing_time).slice(0, 5) : '—'})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {showScheduleModal && scheduleTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setShowScheduleModal(false)}>
          <div className="w-full max-w-md bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold">{t('tournaments.schedule_match', 'Schedule Match + Reserve Court')}</h3>
            <p className="text-xs text-[var(--color-text-muted)]">{t('tournaments.reserve_hint', 'The court is blocked through the shared booking system and conflicts with normal/academy bookings. This reservation is non-financial.')}</p>
            <label className="block text-xs font-medium text-[var(--color-text-muted)]">{t('tournaments.match.date', 'Date')}</label>
            <input type="date" value={scheduleTarget.date} onChange={(e) => setScheduleTarget({ ...scheduleTarget, date: e.target.value })}
              className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)]">{t('tournaments.match.start', 'Start')}</label>
                <input type="time" value={scheduleTarget.start_time} onChange={(e) => setScheduleTarget({ ...scheduleTarget, start_time: e.target.value })}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)]">{t('tournaments.match.end', 'End')}</label>
                <input type="time" value={scheduleTarget.end_time} onChange={(e) => setScheduleTarget({ ...scheduleTarget, end_time: e.target.value })}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm" />
              </div>
            </div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)]">{t('tournaments.match.court', 'Court')}</label>
            <select value={scheduleTarget.resource_id} onChange={(e) => setScheduleTarget({ ...scheduleTarget, resource_id: Number(e.target.value) })}
              className="w-full px-3 py-2 border rounded-[var(--radius-md)] text-sm">
              {courts.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={() => schedule.mutate()} disabled={schedule.isPending || !scheduleTarget.date || !scheduleTarget.start_time || !scheduleTarget.end_time || !scheduleTarget.resource_id}
              className="w-full px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50">
              {schedule.isPending ? 'Reserving...' : t('tournaments.reserve_court', 'Schedule + Reserve Court')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}