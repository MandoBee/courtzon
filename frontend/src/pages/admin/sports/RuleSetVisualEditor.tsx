import { useState } from 'react';
import { useTranslation } from '../../../i18n';

/**
 * Phase 1 — VISUAL Rule Set editor.
 *
 * Renders the canonical scoring/standings JSON contract (`SportScoringRules`
 * + `StandingsRules`) as native controls (radio buttons, checkboxes, numeric
 * inputs, selects) instead of free JSON. The OUTPUT is byte-for-byte the same
 * JSON the Phase A admin API already persists — the backend
 * (`assertScoringConfiguration`) remains the authoritative validator and the
 * match-result engine consumes these exact contracts, so rule-set versioning,
 * active-version safeguards, referenced-version protections and historical
 * match snapshots are all preserved.
 */

type ScoreStructure = 'sets' | 'goals';

const TERMINATION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'retired', label: 'Retired' },
  { value: 'walkover', label: 'Walkover' },
  { value: 'forfeit', label: 'Forfeit' },
  { value: 'abandoned', label: 'Abandoned' },
];

interface StandingsTiebreakerRow {
  field: string;
  direction: 'asc' | 'desc';
}

interface EditorState {
  structure: ScoreStructure;
  bestOf: string;
  setsToWin: string;
  firstTo: string;
  margin: string;
  tiebreakAt: string;
  tiebreakFirstTo: string;
  tiebreakWinBy: string;
  deuce: '' | 'standard' | 'golden_point';
  matchDuration: string;
  halves: string[];
  extraTime: boolean;
  penaltyShootout: boolean;
  drawAllowed: boolean;
  terminations: string[];
  pointsWin: string;
  pointsDraw: string;
  pointsLoss: string;
  tiebreakers: StandingsTiebreakerRow[];
  /** Unknown keys on the input are preserved verbatim so editing never drops
   *  forward-compatible scoring fields the editor does not model. */
  preservedRules: Record<string, unknown>;
  preservedStandings: Record<string, unknown>;
}

const KNOWN_RULE_KEYS = new Set([
  'score_structure', 'draw_allowed', 'terminations',
  'best_of', 'sets_to_win', 'first_to', 'margin',
  'tiebreak_at', 'tiebreak_first_to', 'tiebreak_win_by', 'deuce_rule',
  'match_duration_minutes', 'halves', 'extra_time', 'penalty_shootout',
]);

const KNOWN_STANDINGS_KEYS = new Set(['points', 'tiebreakers']);

function pickUnknown(value: Record<string, unknown> | undefined | null, known: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!value) return out;
  for (const [k, v] of Object.entries(value)) {
    if (!known.has(k)) out[k] = v;
  }
  return out;
}

interface Props {
  rules: Record<string, unknown>;
  standingsRules: Record<string, unknown> | null;
  onChange: (rules: Record<string, unknown>, standingsRules: Record<string, unknown> | null) => void;
  disabled?: boolean;
}

function toInt(value: string): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined;
}

function numToString(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? String(Math.trunc(n)) : '';
}

function initState(rules: Record<string, unknown>, standings: Record<string, unknown> | null): EditorState {
  const r = rules ?? {};
  const points = (standings?.points ?? {}) as Record<string, unknown>;
  const tiebreakersRaw = Array.isArray(standings?.tiebreakers) ? standings.tiebreakers : [];
  return {
    structure: r.score_structure === 'goals' ? 'goals' : 'sets',
    bestOf: numToString(r.best_of),
    setsToWin: numToString(r.sets_to_win),
    firstTo: numToString(r.first_to),
    margin: numToString(r.margin),
    tiebreakAt: numToString(r.tiebreak_at),
    tiebreakFirstTo: numToString(r.tiebreak_first_to),
    tiebreakWinBy: numToString(r.tiebreak_win_by),
    deuce: r.deuce_rule === 'golden_point' || r.deuce_rule === 'standard' ? r.deuce_rule : '',
    matchDuration: numToString(r.match_duration_minutes),
    halves: Array.isArray(r.halves) ? r.halves.map((h) => numToString(h)) : ['', ''],
    extraTime: Boolean(r.extra_time),
    penaltyShootout: Boolean(r.penalty_shootout),
    drawAllowed: Boolean(r.draw_allowed),
    terminations: Array.isArray(r.terminations) ? r.terminations.map((x) => String(x)) : [],
    pointsWin: numToString(points.win),
    pointsDraw: numToString(points.draw),
    pointsLoss: numToString(points.loss),
    tiebreakers: tiebreakersRaw.map((t: any) => ({
      field: String(t?.field ?? 'points'),
      direction: t?.direction === 'asc' ? 'asc' : 'desc',
    })),
    preservedRules: pickUnknown(rules, KNOWN_RULE_KEYS),
    preservedStandings: pickUnknown(standings, KNOWN_STANDINGS_KEYS),
  };
}

function buildRules(s: EditorState): Record<string, unknown> {
  const computed: Record<string, unknown> = {
    score_structure: s.structure,
    draw_allowed: s.drawAllowed,
    terminations: s.terminations,
  };
  if (s.structure === 'sets') {
    if (toInt(s.bestOf) !== undefined) computed.best_of = toInt(s.bestOf);
    if (toInt(s.setsToWin) !== undefined) computed.sets_to_win = toInt(s.setsToWin);
    if (toInt(s.firstTo) !== undefined) computed.first_to = toInt(s.firstTo);
    if (toInt(s.margin) !== undefined) computed.margin = toInt(s.margin);
    if (toInt(s.tiebreakAt) !== undefined) computed.tiebreak_at = toInt(s.tiebreakAt);
    if (toInt(s.tiebreakFirstTo) !== undefined) computed.tiebreak_first_to = toInt(s.tiebreakFirstTo);
    if (toInt(s.tiebreakWinBy) !== undefined) computed.tiebreak_win_by = toInt(s.tiebreakWinBy);
    if (s.deuce) computed.deuce_rule = s.deuce;
  } else {
    if (toInt(s.matchDuration) !== undefined) computed.match_duration_minutes = toInt(s.matchDuration);
    const halves = s.halves.map((h) => toInt(h)).filter((h): h is number => h !== undefined);
    if (halves.length) computed.halves = halves;
    computed.extra_time = s.extraTime;
    computed.penalty_shootout = s.penaltyShootout;
  }
  // Unknown/optional keys preserved verbatim (computed may override none of
  // them — known keys are excluded from `preservedRules`).
  return { ...s.preservedRules, ...computed };
}

function buildStandings(s: EditorState): Record<string, unknown> | null {
  const win = Number(s.pointsWin) || 0;
  const draw = Number(s.pointsDraw) || 0;
  const loss = Number(s.pointsLoss) || 0;
  const tiebreakers = s.tiebreakers.map((t) => ({ field: t.field.trim() || 'points', direction: t.direction }));
  const hasPoints = s.pointsWin.trim() !== '' || s.pointsDraw.trim() !== '' || s.pointsLoss.trim() !== '';
  const preservedCount = Object.keys(s.preservedStandings).length;
  if (!hasPoints && tiebreakers.length === 0 && preservedCount === 0) return null;
  return { ...s.preservedStandings, points: { win, draw, loss }, tiebreakers };
}

const inputClass =
  'w-full rounded-[var(--radius-md)] border bg-[var(--color-bg)] px-2 py-1.5 text-sm disabled:opacity-60';

export default function RuleSetVisualEditor({ rules, standingsRules, onChange, disabled }: Props) {
  const { t } = useTranslation();
  const [state, setState] = useState<EditorState>(() => initState(rules, standingsRules));

  const patch = (next: Partial<EditorState>) => {
    setState((prev) => {
      const merged = { ...prev, ...next };
      onChange(buildRules(merged), buildStandings(merged));
      return merged;
    });
  };

  const toggleTermination = (value: string) =>
    patch({
      terminations: state.terminations.includes(value)
        ? state.terminations.filter((x) => x !== value)
        : [...state.terminations, value],
    });

  const setHalf = (index: number, value: string) =>
    patch({ halves: state.halves.map((h, i) => (i === index ? value : h)) });

  const setTiebreakerField = (index: number, field: string, direction?: 'asc' | 'desc') =>
    patch({
      tiebreakers: state.tiebreakers.map((t, i) =>
        i === index ? { field, direction: direction ?? t.direction } : t,
      ),
    });

  const numberRow = (label: string, value: string, key: keyof EditorState) => (
    <div>
      <label className="mb-1 block text-xs text-[var(--color-text-muted)]">{label}</label>
      <input
        type="number"
        min={1}
        value={value}
        disabled={disabled}
        onChange={(e) => patch({ [key]: e.target.value } as Partial<EditorState>)}
        className={inputClass}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* ── Score structure ── */}
      <div>
        <label className="mb-1 block text-xs text-[var(--color-text-muted)]">
          {t('sports.rule_sets.score_structure', 'Score structure')}
        </label>
        <div className="flex flex-wrap gap-3">
          {(['sets', 'goals'] as const).map((s) => (
            <label key={s} className="flex items-center gap-1.5 text-sm text-[var(--color-text)]">
              <input type="radio" name="rule-structure" checked={state.structure === s} disabled={disabled}
                onChange={() => patch({ structure: s })} />
              {s === 'sets' ? t('sports.rule_sets.sets', 'Sets (best-of / first-to)') : t('sports.rule_sets.goals', 'Goals (halves / duration)')}
            </label>
          ))}
        </div>
      </div>

      {state.structure === 'sets' ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {numberRow(t('sports.rule_sets.best_of', 'Best of'), state.bestOf, 'bestOf')}
          {numberRow(t('sports.rule_sets.sets_to_win', 'Sets to win'), state.setsToWin, 'setsToWin')}
          {numberRow(t('sports.rule_sets.first_to', 'First to'), state.firstTo, 'firstTo')}
          {numberRow(t('sports.rule_sets.margin', 'Win by'), state.margin, 'margin')}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {numberRow(t('sports.rule_sets.match_duration', 'Duration (minutes)'), state.matchDuration, 'matchDuration')}
        </div>
      )}

      {/* ── Tie-break (sets) / halves (goals) ── */}
      {state.structure === 'sets' ? (
        <fieldset disabled={disabled} className="space-y-2">
          <legend className="text-xs font-medium text-[var(--color-text-muted)]">
            {t('sports.rule_sets.tiebreak', 'Tie-break')}
          </legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {numberRow(t('sports.rule_sets.tiebreak_at', 'Tie-break at'), state.tiebreakAt, 'tiebreakAt')}
            {numberRow(t('sports.rule_sets.tiebreak_first_to', 'Tie-break first to'), state.tiebreakFirstTo, 'tiebreakFirstTo')}
            {numberRow(t('sports.rule_sets.tiebreak_win_by', 'Tie-break win by'), state.tiebreakWinBy, 'tiebreakWinBy')}
          </div>
          <div className="flex flex-wrap gap-3">
            {(['standard', 'golden_point'] as const).map((d) => (
              <label key={d} className="flex items-center gap-1.5 text-sm text-[var(--color-text)]">
                <input type="radio" name="rule-deuce" checked={state.deuce === d} disabled={disabled}
                  onChange={() => patch({ deuce: d })} />
                {d === 'standard' ? t('sports.rule_sets.deuce_standard', 'Standard deuce') : t('sports.rule_sets.deuce_golden', 'Golden point')}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <div className="space-y-2">
          <label className="mb-1 block text-xs text-[var(--color-text-muted)]">
            {t('sports.rule_sets.halves', 'Halves (minutes)')}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {state.halves.map((h, i) => (
              <input key={i} type="number" min={1} value={h} disabled={disabled}
                onChange={(e) => setHalf(i, e.target.value)}
                className={`${inputClass} w-20`} />
            ))}
            <button type="button" disabled={disabled}
              onClick={() => patch({ halves: [...state.halves, ''] })}
              className="rounded-[var(--radius-md)] border px-2 py-1.5 text-xs text-[var(--color-text-muted)]">
              + {t('sports.rule_sets.add_half', 'Add half')}
            </button>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-1.5 text-sm text-[var(--color-text)]">
              <input type="checkbox" checked={state.extraTime} disabled={disabled}
                onChange={(e) => patch({ extraTime: e.target.checked })} />
              {t('sports.rule_sets.extra_time', 'Extra time')}
            </label>
            <label className="flex items-center gap-1.5 text-sm text-[var(--color-text)]">
              <input type="checkbox" checked={state.penaltyShootout} disabled={disabled}
                onChange={(e) => patch({ penaltyShootout: e.target.checked })} />
              {t('sports.rule_sets.penalty_shootout', 'Penalty shootout')}
            </label>
          </div>
        </div>
      )}

      {/* ── Common ── */}
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-1.5 text-sm text-[var(--color-text)]">
          <input type="checkbox" checked={state.drawAllowed} disabled={disabled}
            onChange={(e) => patch({ drawAllowed: e.target.checked })} />
          {t('sports.rule_sets.draw_allowed', 'Draws allowed')}
        </label>
      </div>

      <div>
        <label className="mb-1 block text-xs text-[var(--color-text-muted)]">
          {t('sports.rule_sets.terminations', 'Allowed terminations')}
        </label>
        <div className="flex flex-wrap gap-3">
          {TERMINATION_OPTIONS.map((o) => (
            <label key={o.value} className="flex items-center gap-1.5 text-sm text-[var(--color-text)]">
              <input type="checkbox" checked={state.terminations.includes(o.value)} disabled={disabled}
                onChange={() => toggleTermination(o.value)} />
              {o.label}
            </label>
          ))}
        </div>
      </div>

      {/* ── Standings rules ── */}
      <fieldset disabled={disabled} className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
        <legend className="text-xs font-medium text-[var(--color-text-muted)]">
          {t('sports.rule_sets.standings', 'Standings points')}
        </legend>
        <div className="grid grid-cols-3 gap-3">
          {numberRow(t('sports.rule_sets.points_win', 'Win'), state.pointsWin, 'pointsWin')}
          {numberRow(t('sports.rule_sets.points_draw', 'Draw'), state.pointsDraw, 'pointsDraw')}
          {numberRow(t('sports.rule_sets.points_loss', 'Loss'), state.pointsLoss, 'pointsLoss')}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--color-text-muted)]">{t('sports.rule_sets.tiebreakers', 'Tie-breakers')}</span>
          <button type="button" disabled={disabled}
            onClick={() => patch({ tiebreakers: [...state.tiebreakers, { field: 'points', direction: 'desc' }] })}
            className="rounded-[var(--radius-md)] border px-2 py-1 text-xs text-[var(--color-text-muted)]">
            + {t('sports.rule_sets.add_tiebreaker', 'Add tie-breaker')}
          </button>
        </div>
        {state.tiebreakers.map((tb, i) => (
          <div key={i} className="flex items-center gap-2">
            <input value={tb.field} disabled={disabled}
              onChange={(e) => setTiebreakerField(i, e.target.value)}
              className={`${inputClass} flex-1`} />
            <select value={tb.direction} disabled={disabled}
              onChange={(e) => setTiebreakerField(i, tb.field, e.target.value as 'asc' | 'desc')}
              className={inputClass}>
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
            <button type="button" disabled={disabled} aria-label="Remove tie-breaker"
              onClick={() => patch({ tiebreakers: state.tiebreakers.filter((_, j) => j !== i) })}
              className="rounded-[var(--radius-md)] border px-2 py-1 text-xs text-[var(--color-error)]">
              ×
            </button>
          </div>
        ))}
      </fieldset>
    </div>
  );
}