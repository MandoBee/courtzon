import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../../i18n';
import type { RawMatchResultPayload, SportScoringRules } from '../../types/match-result';

export type ResultOutcomeOption = 'completed' | 'retired' | 'walkover' | 'forfeit' | 'abandoned';

interface Props {
  rules: SportScoringRules;
  value?: RawMatchResultPayload | null;
  onChange: (payload: RawMatchResultPayload) => void;
  disabled?: boolean;
}

const inputClass =
  'w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] disabled:opacity-50';

const labelClass = 'block text-xs font-medium text-[var(--color-text-muted)] mb-1';

const outcomeLabelKey: Record<ResultOutcomeOption, string> = {
  completed: 'matchResult.outcome.completed',
  retired: 'matchResult.outcome.retired',
  walkover: 'matchResult.outcome.walkover',
  forfeit: 'matchResult.outcome.forfeit',
  abandoned: 'matchResult.outcome.abandoned',
};

/** Dynamic score form generated purely from the sport format rules JSON (Part A). */
export default function DynamicResultForm({ rules, value, onChange, disabled }: Props) {
  const { t } = useTranslation();
  const [outcome, setOutcome] = useState<ResultOutcomeOption>(value?.outcome || 'completed');
  const [winner, setWinner] = useState<RawMatchResultPayload['winner']>(value?.winner ?? null);
  const [retiredSide, setRetiredSide] = useState<RawMatchResultPayload['termination']>(
    value?.termination ?? null,
  );
  const [terminationReason, setTerminationReason] = useState<string>(value?.termination?.reason ?? '');
  const [sets, setSets] = useState<Array<{ home: number; away: number }>>(
    'sets' in (value?.score || {}) ? (value!.score as any).sets : [{ home: 6, away: 0 }, { home: 0, away: 0 }],
  );
  const [goals, setGoals] = useState(() => {
    const g = 'homeGoals' in (value?.score || {}) ? (value!.score as any) : {};
    return {
      homeGoals: typeof g.homeGoals === 'number' ? g.homeGoals : 0,
      awayGoals: typeof g.awayGoals === 'number' ? g.awayGoals : 0,
      extraTime: !!g.extraTime,
      penalties: g.penalties || null,
    };
  });

  useEffect(() => {
    if (!value) return;
    setOutcome(value.outcome || 'completed');
    if (value.winner != null) setWinner(value.winner);
    if (value.termination) setRetiredSide(value.termination);
    if (value.termination?.reason != null) setTerminationReason(value.termination.reason);
    if (value.score && 'sets' in value.score && Array.isArray(value.score.sets)) {
      setSets(value.score.sets);
    } else if (value.score && 'homeGoals' in value.score) {
      const s = value.score as any;
      setGoals({
        homeGoals: s.homeGoals,
        awayGoals: s.awayGoals,
        extraTime: !!s.extraTime,
        penalties: s.penalties || null,
      });
    }
  }, [value]);

  const bestOf = rules.best_of ?? 3;
  const isGoals = rules.score_structure === 'goals';
  const allowedTerminations = rules.terminations ?? [];

  const emit = (next: {
    outcome?: ResultOutcomeOption;
    winner?: RawMatchResultPayload['winner'];
    retirement?: RawMatchResultPayload['termination'];
    reason?: string;
    sets?: Array<{ home: number; away: number }>;
    goals?: typeof goals;
  }) => {
    const out = next.outcome ?? outcome;
    const payload: RawMatchResultPayload = { outcome: out };
    if (out === 'walkover' || out === 'forfeit') {
      payload.winner = next.winner !== undefined ? next.winner : winner;
    }
    if (out === 'retired') {
      payload.winner = callbackRetiredWinner(next.retirement !== undefined ? next.retirement : retiredSide);
      payload.termination = {
        retired_side: (next.retirement !== undefined ? next.retirement : retiredSide)?.retired_side ?? null,
        reason: next.reason !== undefined ? next.reason : terminationReason || undefined,
      };
    }
    if (out === 'completed') {
      payload.score = isGoals
        ? {
            homeGoals: next.goals ? next.goals.homeGoals : goals.homeGoals,
            awayGoals: next.goals ? next.goals.awayGoals : goals.awayGoals,
            extraTime: next.goals ? next.goals.extraTime : goals.extraTime,
            penalties: next.goals ? next.goals.penalties : goals.penalties,
          }
        : { sets: next.sets !== undefined ? next.sets : sets };
    }
    onChange(payload);
  };

  const setSet = (idx: number, field: 'home' | 'away', raw: string) => {
    const v = Math.max(0, Number(raw) || 0);
    const next = sets.map((s, i) => (i === idx ? { ...s, [field]: v } : s));
    setSets(next);
    emit({ sets: next });
  };

  const swapSides = () => {
    const next = sets.map((s) => ({ home: s.away, away: s.home }));
    setSets(next);
    emit({ sets: next });
    setWinner(winner === 'home' ? 'away' : winner === 'away' ? 'home' : winner);
  };

  const outcomeOptions: ResultOutcomeOption[] = (['completed', ...allowedTerminations] as ResultOutcomeOption[]).filter(
    (o, i, arr) => arr.indexOf(o) === i,
  );

  const sideLabels = useMemo(() => {
    return { home: t('matchResult.home'), away: t('matchResult.away') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  return (
    <div className="space-y-4">
      <div>
        <label className={labelClass}>{t('matchResult.outcome')}</label>
        <select
          className={inputClass}
          value={outcome}
          disabled={disabled}
          onChange={(e) => {
            const o = e.target.value as ResultOutcomeOption;
            setOutcome(o);
            emit({ outcome: o, reason: terminationReason });
          }}
        >
          {outcomeOptions.map((o) => (
            <option key={o} value={o}>
              {t(outcomeLabelKey[o])}
            </option>
          ))}
        </select>
      </div>

      {(outcome === 'walkover' || outcome === 'forfeit') && (
        <div>
          <label className={labelClass}>{t('matchResult.winnerSide')}</label>
          <select
            className={inputClass}
            value={winner ?? ''}
            disabled={disabled}
            onChange={(e) => {
              const w = e.target.value as RawMatchResultPayload['winner'];
              setWinner(w);
              emit({ winner: w });
            }}
          >
            <option value="">{t('matchResult.selectWinner')}</option>
            <option value="home">{sideLabels.home}</option>
            <option value="away">{sideLabels.away}</option>
          </select>
        </div>
      )}

      {outcome === 'retired' && (
        <>
          <div>
            <label className={labelClass}>{t('matchResult.sideThatRetired')}</label>
            <select
              className={inputClass}
              value={retiredSide?.retired_side ?? ''}
              disabled={disabled}
              onChange={(e) => {
                const retirement = { retired_side: e.target.value as any, reason: terminationReason || undefined };
                setRetiredSide(retirement);
                emit({ retirement, reason: terminationReason });
              }}
            >
              <option value="">{t('matchResult.selectSide')}</option>
              <option value="home">{t('matchResult.retiredHome')}</option>
              <option value="away">{t('matchResult.retiredAway')}</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>{t('matchResult.reasonOptional')}</label>
            <input
              className={inputClass}
              value={terminationReason}
              disabled={disabled}
              onChange={(e) => {
                setTerminationReason(e.target.value);
                emit({ reason: e.target.value });
              }}
            />
          </div>
        </>
      )}

      {outcome === 'abandoned' && (
        <p className="text-xs text-[var(--color-text-muted)]">
          {t('matchResult.abandonedNote')}
        </p>
      )}

      {outcome === 'completed' && (
        <>
          {!isGoals ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-[var(--color-text-muted)]">{t('matchResult.setScores')}</h4>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      const next = [...sets, { home: 0, away: 0 }];
                      setSets(next);
                      emit({ sets: next });
                    }}
                    className="text-xs px-2 py-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] hover:bg-[var(--color-surface-muted)] disabled:opacity-50"
                  >
                    {t('matchResult.addSet')}
                  </button>
                  <button
                    type="button"
                    disabled={disabled || sets.length <= 1}
                    onClick={() => {
                      const next = sets.slice(0, -1);
                      setSets(next);
                      emit({ sets: next });
                    }}
                    className="text-xs px-2 py-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] hover:bg-[var(--color-surface-muted)] disabled:opacity-50"
                  >
                    {t('matchResult.removeSet')}
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={swapSides}
                    className="text-xs px-2 py-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] hover:bg-[var(--color-surface-muted)] disabled:opacity-50"
                  >
                    {t('matchResult.swapSides')}
                  </button>
                </div>
              </div>
              {sets.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-[var(--color-text-muted)] w-8">{t('matchResult.setLabel', { n: i + 1 })}</span>
                  <span className="text-xs text-[var(--color-text-muted)] w-12">{sideLabels.home}</span>
                  <input
                    type="number"
                    min={0}
                    className={inputClass}
                    value={s.home}
                    disabled={disabled}
                    onChange={(e) => setSet(i, 'home', e.target.value)}
                  />
                  <span className="text-xs text-[var(--color-text-muted)]">–</span>
                  <input
                    type="number"
                    min={0}
                    className={inputClass}
                    value={s.away}
                    disabled={disabled}
                    onChange={(e) => setSet(i, 'away', e.target.value)}
                  />
                  <span className="text-xs text-[var(--color-text-muted)] w-12">{sideLabels.away}</span>
                </div>
              ))}
              {sets.length < bestOf && (
                <p className="text-xs text-[var(--color-text-muted)]">
                  {t('matchResult.setsHelper', { bestOf })}
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>{t('matchResult.homeGoals')}</label>
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  value={goals.homeGoals}
                  disabled={disabled}
                  onChange={(e) => {
                    const next = { ...goals, homeGoals: Math.max(0, Number(e.target.value) || 0) };
                    setGoals(next);
                    emit({ goals: next });
                  }}
                />
              </div>
              <div>
                <label className={labelClass}>{t('matchResult.awayGoals')}</label>
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  value={goals.awayGoals}
                  disabled={disabled}
                  onChange={(e) => {
                    const next = { ...goals, awayGoals: Math.max(0, Number(e.target.value) || 0) };
                    setGoals(next);
                    emit({ goals: next });
                  }}
                />
              </div>
              {rules.extra_time && (
                <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
                  <input
                    type="checkbox"
                    checked={goals.extraTime}
                    disabled={disabled}
                    onChange={(e) => {
                      const next = { ...goals, extraTime: e.target.checked };
                      setGoals(next);
                      emit({ goals: next });
                    }}
                  />
                  {t('matchResult.extraTimePlayed')}
                </label>
              )}
              {rules.penalty_shootout && (
                <div className="col-span-2">
                  <label className={labelClass}>{t('matchResult.penaltyShootout')}</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={0}
                      placeholder={t('matchResult.home')}
                      className={inputClass}
                      value={goals.penalties?.home ?? ''}
                      disabled={disabled}
                      onChange={(e) => {
                        const next = {
                          ...goals,
                          penalties: { home: Math.max(0, Number(e.target.value) || 0), away: goals.penalties?.away ?? 0 },
                        };
                        setGoals(next);
                        emit({ goals: next });
                      }}
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder={t('matchResult.away')}
                      className={inputClass}
                      value={goals.penalties?.away ?? ''}
                      disabled={disabled}
                      onChange={(e) => {
                        const next = {
                          ...goals,
                          penalties: { home: goals.penalties?.home ?? 0, away: Math.max(0, Number(e.target.value) || 0) },
                        };
                        setGoals(next);
                        emit({ goals: next });
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function callbackRetiredWinner(retirement: RawMatchResultPayload['termination']): RawMatchResultPayload['winner'] {
  if (!retirement?.retired_side) return null;
  return retirement.retired_side === 'home' ? 'away' : 'home';
}