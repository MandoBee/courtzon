import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EligibilityFormSection, { EMPTY_ELIGIBILITY, type TournamentEligibilityFormValue } from './EligibilityFormSection';
import {
  eligibilityAgeCategoryIds,
  hasGenderSpecificAge,
  isJuniorInPattern,
  isSeniorAgeCategory,
  normalizeGenderSelection,
  sortAgeIds,
} from '../../lib/tournamentEligibility';

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn((url: string) =>
      url === '/player-levels'
        ? Promise.resolve({ data: { data: [] } })
        : Promise.resolve({ data: {} }),
    ),
  },
}));

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

/** Controlled render with a value mirror so assertions can read the latest state. */
function setup(initial: TournamentEligibilityFormValue) {
  let value: TournamentEligibilityFormValue = JSON.parse(JSON.stringify(initial));
  const view = render(
    <EligibilityFormSection value={value} onChange={(v) => { value = v; }} />,
    { wrapper: wrapper() },
  );
  const rerender = () => view.rerender(
    <EligibilityFormSection value={value} onChange={(v) => { value = v; }} />,
  );
  return { get value() { return value; }, rerender };
}

describe('Phase 4 Step 1 — lib helpers', () => {
  it('sortAgeIds is deterministic (dedupe + ascending)', () => {
    expect(sortAgeIds([3, 1, 3, 2])).toEqual([1, 2, 3]);
    expect(sortAgeIds([])).toEqual([]);
  });

  it('isJuniorInPattern distinguishes even vs odd junior ids', () => {
    expect(isJuniorInPattern(3, 'even')).toBe(true);   // U18
    expect(isJuniorInPattern(3, 'odd')).toBe(false);
    expect(isJuniorInPattern(115, 'odd')).toBe(true);  // U17
    expect(isJuniorInPattern(115, 'even')).toBe(false);
  });

  it('isSeniorAgeCategory recognises every senior band and rejects juniors', () => {
    expect(isSeniorAgeCategory(200)).toBe(true);   // 35+
    expect(isSeniorAgeCategory(4)).toBe(true);     // 40+
    expect(isSeniorAgeCategory(204)).toBe(true);   // 75+
    expect(isSeniorAgeCategory(3)).toBe(false);    // U18
    expect(isSeniorAgeCategory(999)).toBe(false);
  });

  it('normalizeGenderSelection keeps pattern juniors + seniors, drops cross-pattern/unknown', () => {
    expect(normalizeGenderSelection('odd', [1, 110, 115, 4, 200, 999]))
      .toEqual({ pattern: 'odd', ageCategoryIds: [4, 110, 115, 200] });
    expect(normalizeGenderSelection('even', [115, 3, 200]))
      .toEqual({ pattern: 'even', ageCategoryIds: [3, 200] });
  });

  it('eligibilityAgeCategoryIds unions global + every per-gender block', () => {
    expect(eligibilityAgeCategoryIds({
      ageMode: 'categories',
      ageCategoryIds: [4],
      perGender: {
        male: { pattern: 'even', ageCategoryIds: [1, 200] },
        female: { pattern: 'odd', ageCategoryIds: [110, 4] },
      },
    })).toEqual([1, 4, 110, 200]);
    // open mode → no age restriction, even with stale selections
    expect(eligibilityAgeCategoryIds({
      ageMode: 'open',
      ageCategoryIds: [1],
      perGender: { male: { pattern: 'even', ageCategoryIds: [2] }, female: null },
    })).toEqual([]);
  });

  it('hasGenderSpecificAge is true only when male/female is selected', () => {
    expect(hasGenderSpecificAge({ genderCategories: ['male'] })).toBe(true);
    expect(hasGenderSpecificAge({ genderCategories: ['female', 'mixed'] })).toBe(true);
    expect(hasGenderSpecificAge({ genderCategories: ['mixed'] })).toBe(false);
    expect(hasGenderSpecificAge({ genderCategories: [] })).toBe(false);
  });
});

describe('Phase 4 Step 1 — per-gender age blocks', () => {
  it('legacy behaviour: with no male/female selected, only the global age block renders', () => {
    render(
      <EligibilityFormSection value={{ ...EMPTY_ELIGIBILITY, ageMode: 'categories' }} onChange={() => {}} />,
      { wrapper: wrapper() },
    );
    expect(screen.getByRole('group', { name: 'Age Categories' })).toBeDefined();
    expect(screen.queryByRole('group', { name: 'Male age categories' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Female age categories' })).toBeNull();
  });

  it('mixed-only remains a single (non gender-specific) age block', () => {
    render(
      <EligibilityFormSection value={{ ...EMPTY_ELIGIBILITY, ageMode: 'categories', genderCategories: ['mixed'] }} onChange={() => {}} />,
      { wrapper: wrapper() },
    );
    expect(screen.getByRole('group', { name: 'Age Categories' })).toBeDefined();
    expect(screen.queryByRole('group', { name: /Male age categories/ })).toBeNull();
    expect(screen.queryByRole('group', { name: /Female age categories/ })).toBeNull();
  });

  it('enabling Male/Female creates independent blocks with their own patterns and selections', async () => {
    const s = setup({ ...EMPTY_ELIGIBILITY, ageMode: 'categories' });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Male' }));
    s.rerender();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Female' }));
    s.rerender();

    // Each gender has its own block, distinguished by heading.
    const male = screen.getByRole('group', { name: 'Male age categories' });
    screen.getByRole('group', { name: 'Female age categories' });

    // Male block → ODD pattern + U17 (odd id 115).
    fireEvent.click(within(male).getByRole('radio', { name: 'Odd (U7, U9, …, U21)' }));
    s.rerender();
    const maleAfter = screen.getByRole('group', { name: 'Male age categories' });
    fireEvent.click(within(maleAfter).getByRole('checkbox', { name: 'U17' }));
    s.rerender();

    // Female block stays EVEN → U16 (even id 2).
    const female = screen.getByRole('group', { name: 'Female age categories' });
    fireEvent.click(within(female).getByRole('checkbox', { name: 'U16' }));
    s.rerender();

    expect(s.value.perGender.male).toEqual({ pattern: 'odd', ageCategoryIds: [115] });
    expect(s.value.perGender.female).toEqual({ pattern: 'even', ageCategoryIds: [2] });
  });

  it('each block displays only the age categories of ITS selected pattern', async () => {
    const s = setup({ ...EMPTY_ELIGIBILITY, ageMode: 'categories' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Male' }));
    s.rerender();

    const male = screen.getByRole('group', { name: 'Male age categories' });
    // Even pattern default: U14/U16/U18 present, ODD-only U17 absent.
    expect(within(male).getByRole('checkbox', { name: 'U14' })).toBeDefined();
    expect(within(male).queryByRole('checkbox', { name: 'U17' })).toBeNull();

    fireEvent.click(within(male).getByRole('radio', { name: 'Odd (U7, U9, …, U21)' }));
    s.rerender();
    const maleOdd = screen.getByRole('group', { name: 'Male age categories' });
    expect(within(maleOdd).queryByRole('checkbox', { name: 'U14' })).toBeNull();
    expect(within(maleOdd).getByRole('checkbox', { name: 'U17' })).toBeDefined();
    // Seniors are shared and remain visible regardless of pattern.
    expect(within(maleOdd).getByRole('checkbox', { name: '35+' })).toBeDefined();
  });

  it('switching a gender pattern preserves seniors and drops juniors outside the new pattern only for THAT gender', async () => {
    const s = setup({
      ...EMPTY_ELIGIBILITY,
      ageMode: 'categories',
      genderCategories: ['male', 'female'],
      perGender: {
        male: { pattern: 'even', ageCategoryIds: [1, 2, 200] },  // U14, U16, 35+
        female: { pattern: 'odd', ageCategoryIds: [110, 4] },    // U7, 40+
      },
    });

    const male = screen.getByRole('group', { name: 'Male age categories' });
    fireEvent.click(within(male).getByRole('radio', { name: 'Odd (U7, U9, …, U21)' }));
    s.rerender();

    expect(s.value.perGender.male).toEqual({ pattern: 'odd', ageCategoryIds: [200] }); // seniors kept, even juniors dropped
    expect(s.value.perGender.female).toEqual({ pattern: 'odd', ageCategoryIds: [110, 4] }); // untouched
  });

  it('selections persist across re-renders (wizard step navigation) and are restored after toggling the gender off/on', async () => {
    const s = setup({ ...EMPTY_ELIGIBILITY, ageMode: 'categories' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Male' }));
    s.rerender();
    const male = screen.getByRole('group', { name: 'Male age categories' });
    fireEvent.click(within(male).getByRole('checkbox', { name: 'U14' }));
    s.rerender();
    expect(s.value.perGender.male).toEqual({ pattern: 'even', ageCategoryIds: [1] });

    // Disable then re-enable — the stored selection must be restored, not reseeded.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Male' }));
    s.rerender();
    expect(screen.queryByRole('group', { name: 'Male age categories' })).toBeNull();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Male' }));
    s.rerender();
    expect(s.value.perGender.male).toEqual({ pattern: 'even', ageCategoryIds: [1] });
    const restored = screen.getByRole('group', { name: 'Male age categories' });
    expect(within(restored).getByRole('checkbox', { name: 'U14' })).toBeChecked();
  });

  it('locked mode disables the per-gender blocks and all their controls', async () => {
    let value: TournamentEligibilityFormValue = {
      ...EMPTY_ELIGIBILITY,
      ageMode: 'categories',
      genderCategories: ['male'],
      perGender: { male: { pattern: 'odd', ageCategoryIds: [115, 200] }, female: null },
    };
    render(
      <EligibilityFormSection value={value} onChange={(v) => { value = v; }} locked />,
      { wrapper: wrapper() },
    );
    const male = screen.getByRole('group', { name: 'Male age categories' });
    expect(within(male).getByRole('checkbox', { name: 'U17' })).toBeDisabled();
    expect(within(male).getByRole('radio', { name: /^Odd / })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Male' })).toBeDisabled();
  });
});