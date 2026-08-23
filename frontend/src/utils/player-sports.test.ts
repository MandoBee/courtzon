import { describe, it, expect } from 'vitest';
import { withMainSportInterest, selectableInterestSports, applyMainSportChange } from './player-sports';

const sport = (id: number, name: string) => ({ id, name });
const CATALOG = [sport(1, 'Padel'), sport(2, 'Tennis'), sport(3, 'Football'), sport(4, 'Gym & Fitness')];

/**
 * Regression coverage for the main-sport / interested-sports invariant
 * (registration + profile): the main sport is always an interest, never a
 * selectable secondary, and changing it moves the auto-managed entry.
 */
describe('withMainSportInterest', () => {
  it('always includes the main sport in interests (req 1)', () => {
    expect(withMainSportInterest(1, [])).toEqual([1]);
  });

  it('does not duplicate the main sport when already selected (req 7)', () => {
    expect(withMainSportInterest(1, [3, 1])).toEqual([1, 3]);
  });

  it('preserves explicit secondary sports unchanged (req 6)', () => {
    expect(withMainSportInterest(2, [3, 4])).toEqual([2, 3, 4]);
  });

  it('returns just the secondaries when no main sport is set', () => {
    expect(withMainSportInterest(null, [2, 3])).toEqual([2, 3]);
    expect(withMainSportInterest(undefined, [])).toEqual([]);
  });
});

describe('selectableInterestSports', () => {
  it('excludes the main sport from the selectable list (req 2 / preferred UX)', () => {
    const result = selectableInterestSports(CATALOG, 1).map((s) => s.id);
    expect(result).toEqual([2, 3, 4]);
  });

  it('shows every sport while no main sport is chosen', () => {
    expect(selectableInterestSports(CATALOG, null)).toHaveLength(4);
    expect(selectableInterestSports(CATALOG, 0)).toHaveLength(4);
  });
});

describe('applyMainSportChange', () => {
  it('moves the auto-managed entry from the old main sport to the new one (req 3)', () => {
    // Form holds the full list incl. current main: Padel was main, switch to Tennis.
    const next = applyMainSportChange(1, 2, [1, 3, 4]);
    expect(next).toEqual([2, 3, 4]);
    expect(next).not.toContain(1);
  });

  it('adds the new main even when it was not in the list before', () => {
    // Registration form keeps secondaries only.
    expect(applyMainSportChange(null, 1, [2, 3])).toEqual([1, 2, 3]);
  });

  it('never produces duplicates when switching to a sport already picked as secondary', () => {
    const next = applyMainSportChange(1, 3, [1, 3]);
    expect(next.filter((id) => id === 3)).toHaveLength(1);
    expect(next).toEqual([3]);
  });
});
