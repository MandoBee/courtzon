import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EligibilityFormSection, { EMPTY_ELIGIBILITY, type TournamentEligibilityFormValue } from './EligibilityFormSection';
import EligibilitySummary from './EligibilitySummary';

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn((url: string) =>
      url === '/player-levels'
        ? Promise.resolve({ data: { data: [{ id: 1, name: 'Beginner' }, { id: 2, name: 'Intermediate' }, { id: 3, name: 'Advanced' }] } })
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

describe('G7-D EligibilityFormSection', () => {
  it('open eligibility renders and youth selection works', async () => {
    let value: TournamentEligibilityFormValue = { ...EMPTY_ELIGIBILITY };
    const { rerender } = render(
      <EligibilityFormSection value={value} onChange={(v) => { value = v; }} />,
      { wrapper: wrapper() },
    );

    expect(screen.getByRole('radio', { name: /Open Age/ })).toBeChecked();

    fireEvent.click(screen.getByRole('radio', { name: /Age Categories/ }));
    rerender(<EligibilityFormSection value={value} onChange={(v) => { value = v; }} />);

    const u14 = screen.getByRole('button', { name: 'U14' });
    fireEvent.click(u14);
    rerender(<EligibilityFormSection value={value} onChange={(v) => { value = v; }} />);
    expect(value.ageMode).toBe('categories');
    expect(value.ageCategoryIds).toEqual([1]);
  });

  it('masters selection works and clears opposite family (youth XOR masters)', async () => {
    let value: TournamentEligibilityFormValue = { ...EMPTY_ELIGIBILITY, ageMode: 'categories', ageCategoryIds: [1] };
    render(
      <EligibilityFormSection value={value} onChange={(v) => { value = v; }} />,
      { wrapper: wrapper() },
    );

    const masters40 = screen.getByRole('button', { name: '40+' });
    fireEvent.click(masters40);

    expect(value.ageCategoryIds).toEqual([4]);
    expect(value.ageCategoryIds.every((id) => id >= 4)).toBe(true);
  });

  it('very high-level: gender multi-select and level options render', async () => {
    render(
      <EligibilityFormSection value={{ ...EMPTY_ELIGIBILITY, genderCategories: ['mixed'], levelIds: [2] }} onChange={() => {}} />,
      { wrapper: wrapper() },
    );

    expect(screen.getByRole('checkbox', { name: 'Mixed' })).toBeChecked();
    // Level options come from the live API (not hardcoded)
    expect(await screen.findByText('Beginner')).toBeDefined();
    expect(screen.getByRole('checkbox', { name: 'Open / Any Level' })).not.toBeChecked();
  });

  it('ELIGIBILITY_LOCKED renders read-only UX (disabled controls + notice)', async () => {
    let value: TournamentEligibilityFormValue = { ...EMPTY_ELIGIBILITY, ageMode: 'categories' };
    render(
      <EligibilityFormSection value={value} onChange={(v) => { value = v; }} locked />,
      { wrapper: wrapper() },
    );

    expect(screen.getByText(/eligibility is locked/i)).toBeDefined();
    const openRadio = screen.getByRole('radio', { name: /Open Age/ });
    expect(openRadio).toBeDisabled();
    const u14 = screen.getByRole('button', { name: 'U14' });
    expect(u14).toBeDisabled();
    const male = screen.getByRole('checkbox', { name: 'Male' });
    expect(male).toBeDisabled();
    fireEvent.click(u14);
    expect(value.ageMode).toBe('categories');
    expect(value.ageCategoryIds).toEqual([]);
  });
});

describe('G7-D EligibilitySummary', () => {
  it('renders configured eligibility with human labels (no raw ids)', async () => {
    render(
      <EligibilitySummary tournament={{ age_mode: 'categories', age_category_ids: [1, 2], gender_categories: ['male'], level_ids: [3] }} />,
      { wrapper: wrapper() },
    );

    expect(screen.getByText(/U14/)).toBeDefined();
    expect(screen.getByText(/U16/)).toBeDefined();
    expect(screen.getByText('Male')).toBeDefined();
    expect(await screen.findByText('Advanced')).toBeDefined();
  });

  it('open eligibility shows concise "Open" labels, not misleading restrictions', () => {
    render(
      <EligibilitySummary tournament={{ age_mode: 'open', gender_categories: [], level_ids: [] }} />,
      { wrapper: wrapper() },
    );

    expect(screen.getByText(/Open Age/)).toBeDefined();
    expect(screen.getByText(/No Gender Restriction/)).toBeDefined();
    expect(screen.getByText(/Open \/ Any Level/)).toBeDefined();
    expect(screen.queryByText(/U14/)).toBeNull();
  });
});