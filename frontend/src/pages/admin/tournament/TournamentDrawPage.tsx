import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useTranslation } from '../../../i18n';
import { useToast } from '../../../components/ui/Toast';
import { Can } from '../../../permissions/Can';
import { SkeletonRow } from '../../../components/ui/Skeleton';
import { tournamentParticipantApi, orgTournamentParticipantApi } from '../../../services/tournament';
import { getErrorMessage } from '../../../utils/errors';

export type TournamentDrawContextMode = 'admin' | 'org';
interface Props { mode?: TournamentDrawContextMode; orgId?: string }

/**
 * G8 — Tournament Draw screen (drag & drop). The LOCKED draw is the single
 * source of truth for match generation: this screen lets an admin place
 * participants into draw positions, regenerate before locking, approve and
 * lock. Seeds/participant identity/rating snapshots are NEVER silently changed
 * — moveParticipant only changes DRAW POSITION (a seeding-rule violation is
 * surfaced as an explicit warning, never silently fixed).
 */
export default function TournamentDrawPage({ mode = 'admin', orgId: orgIdProp }: Props) {
  const params = useParams<{ id: string; orgId?: string }>();
  const tournamentId = Number(params.id);
  const orgId = orgIdProp ?? params.orgId;
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const qc = useQueryClient();

  const isOrg = mode === 'org';
  const api = isOrg && orgId ? orgTournamentParticipantApi : tournamentParticipantApi;
  const wrap = (fn: (...a: any[]) => any, ...a: any[]) => (isOrg && orgId ? fn(orgId, ...a) : fn(...a));
  const managePerm = isOrg && orgId ? 'org.tournaments.manage' : 'tournaments.manage';

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const { data: participantsData, isLoading } = useQuery({
    queryKey: ['tournament-participants', tournamentId],
    queryFn: () => wrap(api.getParticipants, tournamentId),
  });
  const participants = Array.isArray(participantsData) ? participantsData : [];

  const { data: draw } = useQuery({
    queryKey: ['tournament-draw', tournamentId],
    queryFn: () => wrap(api.getCurrentDraw, tournamentId),
  });
  const drawEntries = Array.isArray(draw?.entries) ? draw.entries : [];

  const { data: validation } = useQuery({
    queryKey: ['tournament-draw-validation', tournamentId],
    queryFn: () => wrap(api.validateDraw, tournamentId),
    enabled: (draw?.entries?.length ?? 0) > 0,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['tournament-participants', tournamentId] });
    qc.invalidateQueries({ queryKey: ['tournament-draw', tournamentId] });
    qc.invalidateQueries({ queryKey: ['tournament-draw-validation', tournamentId] });
  };

  const move = useMutation({
    mutationFn: ({ participantId, position }: { participantId: number; position: number }) =>
      wrap(api.moveParticipant, tournamentId, participantId, position),
    onSuccess: (r: any) => {
      if (r && r.valid === false) {
        showToast(r.message || 'Seeding-rule violation — not applied', 'warning');
      } else {
        showToast(t('tournaments.draw_moved', 'Participant moved'), 'success');
      }
      invalidate();
    },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const generate = useMutation({
    mutationFn: () => wrap(api.generateDraw, tournamentId),
    onSuccess: () => { showToast(t('tournaments.draw_generated', 'Draw generated'), 'success'); invalidate(); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const approve = useMutation({
    mutationFn: () => wrap(api.approveDraw, tournamentId),
    onSuccess: () => { showToast(t('tournaments.draw_approved', 'Draw approved'), 'success'); invalidate(); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const lock = useMutation({
    mutationFn: () => wrap(api.lockDraw, tournamentId),
    onSuccess: () => { showToast(t('tournaments.draw_locked', 'Draw locked'), 'success'); invalidate(); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const drawStatus = draw?.status ?? null;
  const locked = drawStatus === 'locked';
  const approved = drawStatus === 'approved';

  const placed = useMemo(() => {
    const map = new Map<number, any>();
    for (const e of drawEntries) map.set(Number(e.participant_id), e);
    return map;
  }, [drawEntries]);

  const unplaced = participants.filter((p: any) => !placed.has(Number(p.id)));

  const onDragEnd = (event: any) => {
    if (locked) { showToast(t('tournaments.draw_locked_hint', 'The draw is locked — movements are disabled'), 'warning'); return; }
    const participantId = Number(event.active?.id);
    const targetPositionRaw = event.over?.id;
    if (!targetPositionRaw || !participantId) return;
    if (String(targetPositionRaw).startsWith('pos-')) {
      const position = Number(String(targetPositionRaw).replace('pos-', ''));
      move.mutate({ participantId, position });
    } else if (String(targetPositionRaw).startsWith('participant-')) {
      const targetParticipantId = Number(String(targetPositionRaw).replace('participant-', ''));
      const targetEntry = placed.get(targetParticipantId);
      if (targetEntry) move.mutate({ participantId, position: Number(targetEntry.position) });
    }
  };

  if (isLoading) return <div className="p-6"><SkeletonRow count={4} /></div>;

  // Group positions into round-1 matches for knockout brackets (draw positions are authoritative).
  const positionCount = Math.max(drawEntries.length, participants.length, 2);
  const matches: Array<{ matchIndex: number; slots: Array<{ position: number; entry: any }> }> = [];
  for (let i = 0; i < positionCount; i += 2) {
    matches.push({
      matchIndex: i / 2,
      slots: [
        { position: i, entry: drawEntries.find((e: any) => Number(e.position) === i) ?? null },
        { position: i + 1, entry: drawEntries.find((e: any) => Number(e.position) === i + 1) ?? null },
      ],
    });
  }

  const drawWarnings: string[] = [];
  if (draw && draw.entries && draw.entries.length < 2) drawWarnings.push(t('tournaments.warn_missing_participants', 'Not enough participants for a draw.'));
  if (validation && validation.valid === false) drawWarnings.push(validation.message || t('tournaments.warn_seed_violation', 'A seeding-rule violation was detected.'));
  if (drawStatus === 'approved' || drawStatus === 'locked') drawWarnings.push(t('tournaments.warn_draw_finalized', 'The draw is finalized — match generation will use this locked order.'));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">{t('tournaments.draw', 'Tournament Draw')}</h1>
          <div className="flex items-center gap-2 mt-1 text-xs text-[var(--color-text-muted)]">
            <span className="font-semibold capitalize">{drawStatus ?? '—'}</span>
            {draw?.attempt_number ? <span>• attempt #{draw.attempt_number}</span> : null}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Can permission={managePerm}>
            <button onClick={() => generate.mutate()} disabled={locked || generate.isPending}
              className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white disabled:opacity-50">
              {draw ? 'Re-Draw' : 'Generate Draw'}
            </button>
            <button onClick={() => approve.mutate()} disabled={approved || locked || approve.isPending || (draw?.entries?.length ?? 0) < 2}
              className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] border border-green-300 text-green-700 disabled:opacity-50">
              Approve Draw
            </button>
            <button onClick={() => lock.mutate()} disabled={!approved || lock.isPending}
              className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] border border-amber-300 text-amber-700 disabled:opacity-50">
              Lock Draw
            </button>
          </Can>
          <Can permission={managePerm}>
            <button onClick={() => navigate(isOrg ? `/org/${orgId}/tournaments/${tournamentId}/schedule` : `/admin/tournament/list/${tournamentId}/schedule`)}
              className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)]">
              {t('tournaments.matches_schedule', 'Matches & Schedule')} →
            </button>
          </Can>
        </div>
      </div>

      {drawWarnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-[var(--radius-lg)] p-4 space-y-1">
          {drawWarnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-800">⚠ {w}</p>
          ))}
        </div>
      )}

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* Participant sidebar (drag sources) */}
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 h-fit">
            <h2 className="text-sm font-semibold mb-3">{t('tournaments.participants', 'Participants')}</h2>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {participants.map((p: any) => (
                <DraggableParticipant key={p.id} participant={p} placed={placed.has(Number(p.id))} disabled={locked} />
              ))}
              {unplaced.length === 0 && participants.length === 0 && (
                <p className="text-xs text-[var(--color-text-muted)]">{t('tournaments.no_participants', 'No participants yet.')}</p>
              )}
            </div>
          </div>

          {/* Draw board */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">{t('tournaments.draw_positions', 'Draw Positions')}</h2>
              <p className="text-[11px] text-[var(--color-text-muted)]">{t('tournaments.draw_seed_hint', 'Drag a participant onto a position. Seeds and participant identity are never changed.')}</p>
            </div>
            {matches.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)]">{t('tournaments.draw_empty', 'Generate a draw to start placing participants.')}</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {matches.map((m) => (
                  <div key={m.matchIndex} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3">
                    <p className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase mb-2">{t('tournaments.match', 'Match')} {m.matchIndex + 1}</p>
                    <div className="space-y-2">
                      {m.slots.map((s) => (
                        <DrawSlot key={s.position} position={s.position} entry={s.entry} disabled={locked} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Seeded protection zone */}
            {drawEntries.length > 0 && (
              <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 text-xs text-[var(--color-text-muted)]">
                <span className="font-semibold">{t('tournaments.seed_protection', 'Seed protection:')}</span>{' '}
                {t('tournaments.seed_protection_hint', 'Seeded participants hold the protected top positions in ascending seed order. Moving a seeded participant outside the protected zone is rejected unless explicitly overridden — the seed number is never changed.')}
              </div>
            )}
          </div>
        </div>
      </DndContext>
    </div>
  );
}

function DraggableParticipant({ participant, placed, disabled }: { participant: any; placed: boolean; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `participant-${participant.id}`, disabled });
  const members = Array.isArray(participant?.members) ? participant.members.filter((m: any) => m.status === 'active') : [];
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      className={`p-2.5 rounded-[var(--radius-md)] border text-xs cursor-grab select-none transition-opacity ${isDragging ? 'opacity-50 border-[var(--color-primary)]' : 'border-[var(--color-border)] bg-[var(--color-bg)]'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-[var(--color-text)]">{participant.name || participant.display_name || `Participant #${participant.id}`}</span>
        <span className="flex items-center gap-1">
          {participant.seed ? <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold">#{participant.seed.seed_number}</span> : null}
          {placed ? <span className="text-[9px] text-green-600 font-medium">placed</span> : <span className="text-[9px] text-amber-600 font-medium">unplaced</span>}
        </span>
      </div>
      <div className="text-[10px] text-[var(--color-text-muted)] capitalize">{participant.participant_type}</div>
      {members.length > 0 && (
        <div className="text-[10px] text-[var(--color-text-muted)]">{members.map((m: any) => m.full_name || `#${m.user_id}`).join(' + ')}</div>
      )}
      {participant.seed?.source === 'rating' && participant.seed?.rating_snapshot != null && (
        <div className="text-[10px] text-[var(--color-text-muted)]">Rating: {participant.seed.rating_snapshot}%</div>
      )}
    </div>
  );
}

function DrawSlot({ position, entry, disabled }: { position: number; entry: any; disabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `pos-${position}`, disabled });
  return (
    <div ref={setNodeRef}
      className={`min-h-[54px] rounded-[var(--radius-md)] border p-2 transition-colors ${isOver ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10' : 'border-dashed border-[var(--color-border)]'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-[var(--color-text-muted)] font-mono">#{position}</span>
        {entry?.overridden ? <span className="text-[9px] text-amber-600 font-medium">overridden</span> : null}
      </div>
      {entry ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-[var(--color-text)]">{entry.display_name || `Participant #${entry.participant_id}`}</span>
          {entry.seed_number != null ? <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-bold">#{entry.seed_number}</span> : null}
        </div>
      ) : (
        <p className="text-[10px] text-[var(--color-text-muted)]">{disabled ? '—' : 'drop here'}</p>
      )}
    </div>
  );
}