import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useTranslation } from '../../../i18n';
import { useToast } from '../../../components/ui/Toast';
import { Can } from '../../../permissions/Can';
import { SkeletonRow } from '../../../components/ui/Skeleton';
import { tournamentApi, orgTournamentApi, tournamentParticipantApi, orgTournamentParticipantApi } from '../../../services/tournament';
import { getErrorMessage } from '../../../utils/errors';

export type TournamentDrawContextMode = 'admin' | 'org';
interface Props { mode?: TournamentDrawContextMode; orgId?: string }

const SUPPORTED = ['knockout', 'round_robin'];

/**
 * G8 — Tournament Draw screen (drag & drop). The LOCKED draw is the single
 * source of truth for match generation: this screen lets an admin place
 * participants into draw positions, regenerate before locking, approve and
 * lock. Seeds/participant identity/rating snapshots are NEVER silently changed
 * — moveParticipant only changes DRAW POSITION (a seeding-rule violation is
 * surfaced as an explicit warning, never silently fixed).
 *
 * The board is derived from AUTHORITATIVE draw data + the engine's deterministic
 * bracket topology (next power of two, consecutive round-1 pairing, later rounds
 * from winners). It distinguishes: ACTUAL filled slot, BYE (single participant),
 * FUTURE slot awaiting a winner (structural placeholder — NOT a fake match), and
 * EMPTY padding. Round-robin renders the actual round-by-round pairings (circle
 * method, same as the engine). Unsupported formats show an explicit state.
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
  const detailApi = isOrg && orgId ? orgTournamentApi : tournamentApi;
  const wrap = (fn: (...a: any[]) => any, ...a: any[]) => (isOrg && orgId ? fn(orgId, ...a) : fn(...a));
  const managePerm = isOrg && orgId ? 'org.tournaments.manage' : 'tournaments.manage';

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const { data: tournament } = useQuery({
    queryKey: ['tournament', tournamentId],
    queryFn: () => wrap(detailApi.getTournament, tournamentId),
  });
  const format = tournament?.format ?? null;

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

  const positionCount = Math.max(drawEntries.length, participants.length, 2);
  const entryByPosition = (pos: number) => drawEntries.find((e: any) => Number(e.position) === pos) ?? null;

  // ── Authoritative bracket topology (mirrors the engine, never fabricates data) ──
  const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(Math.max(positionCount, 2))));
  const totalRounds = Math.max(1, Math.round(Math.log2(nextPowerOf2)));
  const roundLabel = (round: number): string => {
    const fromEnd = totalRounds - round;
    if (fromEnd === 0) return 'Final';
    if (fromEnd === 1) return 'Semi-final';
    if (fromEnd === 2) return 'Quarter-final';
    return `Round ${round}`;
  };
  // Knockout rounds: round 1 pairs consecutive draw positions; later rounds are
  // structural slots awaiting a winner (NOT fake matches).
  const knockoutRounds: Array<{ round: number; label: string; matches: Array<{ position: number; index: number }> }> = [];
  if (format === 'knockout') {
    for (let r = 1; r <= totalRounds; r++) {
      const matchCount = nextPowerOf2 / Math.pow(2, r);
      const matches: Array<{ position: number; index: number }> = [];
      for (let i = 0; i < matchCount; i++) {
        // Round-1 matches map to draw positions [2i, 2i+1]; later rounds are placeholders.
        const position = r === 1 ? i * 2 : -1;
        matches.push({ position, index: i });
      }
      knockoutRounds.push({ round: r, label: roundLabel(r), matches });
    }
  }
  // Round-robin pairings via the circle method (same as the engine). Plain
  // computation (not a hook) — it runs after the early `isLoading` return.
  const roundRobinRounds = (() => {
    if (format !== 'round_robin') return [];
    const ids = Array.from({ length: positionCount }, (_, i) => i);
    const n = ids.length;
    if (n < 2) return [];
    const arr = n % 2 === 1 ? [...ids, -1] : [...ids];
    const m = arr.length;
    const rounds: Array<{ round: number; pairings: Array<{ a: number | null; b: number | null }> }> = [];
    for (let r = 0; r < m - 1; r++) {
      const pairings: Array<{ a: number | null; b: number | null }> = [];
      for (let i = 0; i < m / 2; i++) {
        const a = arr[i];
        const b = arr[m - 1 - i];
        if (a === -1 || b === -1) { pairings.push({ a: a === -1 ? null : a, b: b === -1 ? null : b }); continue; }
        pairings.push({ a, b });
      }
      rounds.push({ round: r + 1, pairings });
      const last = arr[m - 1];
      for (let i = m - 1; i > 1; i--) arr[i] = arr[i - 1];
      arr[1] = last;
    }
    return rounds;
  })();

  const drawWarnings: string[] = [];
  if (draw && draw.entries && draw.entries.length < 2) drawWarnings.push(t('tournaments.warn_missing_participants', 'Not enough participants for a draw.'));
  if (validation && validation.valid === false) drawWarnings.push(validation.message || t('tournaments.warn_seed_violation', 'A seeding-rule violation was detected.'));
  if (drawStatus === 'approved' || drawStatus === 'locked') drawWarnings.push(t('tournaments.warn_draw_finalized', 'The draw is finalized — match generation will use this locked order.'));
  if (format != null && !SUPPORTED.includes(format)) drawWarnings.push(t('tournaments.warn_unsupported_format', 'This bracket type is not yet supported for the draw board.'));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">{t('tournaments.draw', 'Tournament Draw')}</h1>
          <div className="flex items-center gap-2 mt-1 text-xs text-[var(--color-text-muted)]">
            <span className="font-semibold capitalize">{drawStatus ?? '—'}</span>
            {draw?.attempt_number ? <span>• attempt #{draw.attempt_number}</span> : null}
            {format ? <span>• {format}</span> : null}
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
          <div className="space-y-4 min-w-0">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-sm font-semibold">{t('tournaments.draw_positions', 'Draw Board')}</h2>
              <p className="text-[11px] text-[var(--color-text-muted)]">{t('tournaments.draw_seed_hint', 'Drag a participant onto a position. Seeds and participant identity are never changed.')}</p>
            </div>

            {format == null && (
              <p className="text-xs text-[var(--color-text-muted)]">{t('tournaments.draw_empty', 'Generate a draw to start placing participants.')}</p>
            )}

            {format != null && !SUPPORTED.includes(format) && (
              <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-5">
                <p className="text-sm font-semibold text-[var(--color-text)]">{t('tournaments.unsupported_format', 'Unsupported bracket type')}</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">{t('tournaments.unsupported_format_hint', 'The "{{format}}" bracket is not yet implemented. No bracket is fabricated.', { format })}</p>
              </div>
            )}

            {format === 'knockout' && (
              <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 overflow-x-auto">
                <div className="flex gap-6 min-w-[720px]">
                  {knockoutRounds.map((r) => (
                    <div key={r.round} className="flex-1 min-w-[200px]">
                      <p className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase mb-3">{r.label}</p>
                      <div className="space-y-8">
                        {r.matches.map((m) => (
                          <div key={m.index} className="space-y-2">
                            {r.round === 1 ? (
                              <>
                                <KnockoutSlot position={m.position} entry={entryByPosition(m.position)} kind="filled" disabled={locked} />
                                <KnockoutSlot position={m.position + 1} entry={entryByPosition(m.position + 1)} kind="filled" disabled={locked} />
                              </>
                            ) : (
                              <div className="min-h-[54px] rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-2 flex items-center justify-center">
                                <span className="text-[10px] text-[var(--color-text-muted)]">{t('tournaments.awaiting_winner', 'awaiting winner')}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {format === 'round_robin' && (
              <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 overflow-x-auto">
                <div className="flex gap-6 min-w-[640px]">
                  {roundRobinRounds.map((r) => (
                    <div key={r.round} className="flex-1 min-w-[180px]">
                      <p className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase mb-3">{t('tournaments.match_round', 'Round')} {r.round}</p>
                      <div className="space-y-2">
                        {r.pairings.map((p, i) => (
                          <div key={i} className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-2 text-xs">
                            {p.a === null || p.b === null
                              ? <span className="text-[var(--color-text-muted)]">bye</span>
                              : <span className="flex justify-between gap-2">
                                  <span>{entryByPosition(p.a)?.display_name || `#${p.a}`}</span>
                                  <span className="text-[var(--color-text-muted)]">vs</span>
                                  <span>{entryByPosition(p.b)?.display_name || `#${p.b}`}</span>
                                </span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
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

/** A round-1 draw slot. `kind` distinguishes filled / bye / empty from authoritative data. */
function KnockoutSlot({ position, entry, kind, disabled }: { position: number; entry: any; kind: 'filled' | 'bye' | 'empty'; disabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `pos-${position}`, disabled });
  const hasParticipant = entry != null;
  const slotKind = hasParticipant ? 'filled' : kind;
  return (
    <div ref={setNodeRef}
      className={`min-h-[54px] rounded-[var(--radius-md)] border p-2 transition-colors ${isOver ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10' : slotKind === 'filled' ? 'border-[var(--color-border)] bg-[var(--color-bg)]' : 'border-dashed border-[var(--color-border)]'}`}>
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
        <p className="text-[10px] text-[var(--color-text-muted)]">{slotKind === 'bye' ? 'bye' : (disabled ? '—' : 'drop here')}</p>
      )}
    </div>
  );
}