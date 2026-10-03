import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CompetitionManager, { buildCreateForm } from './CompetitionManager';

/**
 * G11.21.3 — Competition Category Configuration Contract.
 *
 * 1. registration_fee becomes VISIBLE but READ-ONLY. The accounting/payment
 *    layer never reads it for charging (`registrationFee()` has no callers; five
 *    financial suites assert `not.toContain('registration_fee')`), so the UI
 *    must show it as reference data and preserve it UNCHANGED on every edit —
 *    it must never be an editable input nor silently dropped.
 * 2. The backend DTO tightens currency_code to trim → uppercase → exactly 3
 *    ASCII letters (tests live in `tournament.dto.spec.ts`).
 * 3. G11.21.1 / G11.21.2 inheritance and the EDIT-from-stored-values contract
 *    must remain intact (regression pins).
 *
 * The read-only wrong-currency audit is a separate SELECT-only data check, not
 * a component behaviour.
 */

const orgId = '4242';
const tournamentId = 100;

const mockApi = vi.hoisted(() => ({
  getTournament: vi.fn(),
  listCompetitions: vi.fn(),
  createCompetition: vi.fn(),
  updateCompetition: vi.fn(),
  deactivateCompetition: vi.fn(),
}));

vi.mock('../../services/tournament', () => ({
  orgTournamentApi: mockApi,
}));

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../../i18n', () => ({
  useTranslation: () => ({
    // CompetitionManager always passes an English fallback as the 2nd arg.
    t: (key: string, def?: string) => (typeof def === 'string' ? def : key),
  }),
}));

vi.mock('../../store/auth.store', () => ({
  useAuthStore: (selector: (s: { user: { permissions: string[] } }) => unknown) =>
    selector({ user: { permissions: ['*'] } }),
}));

/** A tournament the backend would inherit from (G11.21.1/.2 wire shapes). */
function paidTournament(overrides: Record<string, unknown> = {}) {
  return {
    id: tournamentId,
    name: 'G11.21.3 Cup',
    currency_code: 'EGP',
    entry_fee: 350,
    registration_fee: 400,
    // MySQL tinyint — NOT a boolean. This is the real wire shape.
    waitlist_enabled: 1,
    ...overrides,
  };
}

function oneCompetition(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Default',
    competition_type: 'singles',
    entry_fee: 0,
    registration_fee: 0,
    currency_code: 'EGP',
    price_type: 'FIXED',
    max_participants: null,
    min_participants: 2,
    waitlist_enabled: 0,
    is_default: true,
    active_participants: 0,
    waiting_participants: 0,
    can_deactivate: false,
    deactivation_blockers: [],
    ...overrides,
  };
}

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function renderManager() {
  return render(<CompetitionManager orgId={orgId} tournamentId={tournamentId} />, { wrapper: wrapper() });
}

/** Wait for the tournament config query, then open the Create or Edit form. */
async function openCreateForm() {
  const button = await screen.findByTestId('competition-create');
  await waitFor(() => expect(button).not.toBeDisabled());
  fireEvent.click(button);
  return screen.getByLabelText('Entry fee') as HTMLInputElement;
}

async function openEditForm(index: number) {
  const editButtons = await screen.findAllByRole('button', { name: 'Edit' });
  fireEvent.click(editButtons[index]);
  return screen.getByLabelText('Entry fee') as HTMLInputElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.getTournament.mockResolvedValue(paidTournament());
  mockApi.listCompetitions.mockResolvedValue([oneCompetition()]);
  mockApi.createCompetition.mockResolvedValue({ id: 2 });
  mockApi.updateCompetition.mockResolvedValue({ id: 2 });
  mockApi.deactivateCompetition.mockResolvedValue({ deactivated: true });
});

// ── registration_fee is READ-ONLY ────────────────────────────────────────────
describe('G11.21.3 — registration_fee renders read-only', () => {
  it('shows the inherited registration_fee as read-only text (no editable input)', async () => {
    renderManager();
    await openCreateForm();

    // No editable "Registration fee" input exists anywhere in the form.
    expect(screen.queryByRole('spinbutton', { name: 'Registration fee' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Registration fee')).not.toBeInTheDocument();
    // The inherited value (tournament registration_fee = 400) is displayed.
    expect(screen.getByTestId('registration-fee-readonly')).toHaveTextContent('400 EGP');
    // The hint must be present so an operator never mistakes it for a charge.
    expect(screen.getByText('Informational — not used for charging.')).toBeInTheDocument();
  });

  it('shows "Free" when the inherited registration_fee is 0', async () => {
    mockApi.getTournament.mockResolvedValue(paidTournament({ entry_fee: 0, registration_fee: 0 }));
    renderManager();
    await openCreateForm();
    expect(screen.getByTestId('registration-fee-readonly')).toHaveTextContent('Free');
  });

  it('shows the registration_fee in the category list summary', async () => {
    mockApi.listCompetitions.mockResolvedValue([
      oneCompetition(),
      oneCompetition({ id: 2, name: 'Doubles', is_default: false, registration_fee: 30, can_deactivate: true }),
    ]);
    renderManager();
    await waitFor(() => expect(screen.getByTestId('competition-meta-2')).toBeInTheDocument());
    expect(screen.getByTestId('competition-meta-2')).toHaveTextContent('Registration: 30 EGP');
  });
});

// ── registration_fee survives EDIT unchanged ────────────────────────────────
describe('G11.21.3 — registration_fee survives EDIT', () => {
  it('preserves the stored registration_fee exactly when another field changes', async () => {
    mockApi.listCompetitions.mockResolvedValue([
      oneCompetition(),
      oneCompetition({ id: 2, name: 'Doubles', is_default: false, entry_fee: 25, registration_fee: 30, currency_code: 'SAR', can_deactivate: true }),
    ]);
    renderManager();
    await openEditForm(1);

    // The form shows the CATEGORY's stored value, not the tournament's 400.
    expect(screen.getByTestId('registration-fee-readonly')).toHaveTextContent('30 SAR');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed Doubles' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockApi.updateCompetition).toHaveBeenCalled());
    expect(mockApi.updateCompetition.mock.calls[0][3].registration_fee).toBe(30);
  });

  it('preserves an explicit stored registration_fee of 0 (never coerced to "unset")', async () => {
    mockApi.listCompetitions.mockResolvedValue([
      oneCompetition(),
      oneCompetition({ id: 2, name: 'Doubles', is_default: false, entry_fee: 25, registration_fee: 0, currency_code: 'SAR', can_deactivate: true }),
    ]);
    renderManager();
    await openEditForm(1);

    expect(screen.getByTestId('registration-fee-readonly')).toHaveTextContent('Free');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockApi.updateCompetition).toHaveBeenCalled());
    const payload = mockApi.updateCompetition.mock.calls[0][3];
    // Exactly 0 — never undefined, never null.
    expect(payload.registration_fee).toBe(0);
    expect(payload.registration_fee).not.toBeUndefined();
  });

  it('CREATE still submits the inherited registration_fee unchanged', async () => {
    renderManager();
    await openCreateForm();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Doubles' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockApi.createCompetition).toHaveBeenCalled());
    expect(mockApi.createCompetition.mock.calls[0][2].registration_fee).toBe(400);
  });
});

// ── Regressions: G11.21.1 / G11.21.2 and EDIT-from-stored-values ────────────
describe('G11.21.3 — G11.21.1/.2 inheritance and EDIT contract remain intact', () => {
  it('keeps G11.21.1 inheritance (entry/registration fee + waitlist from the tournament)', () => {
    const form = buildCreateForm(paidTournament());
    expect(form.entry_fee).toBe(350);
    expect(form.registration_fee).toBe(400);
    expect(form.waitlist_enabled).toBe(true);
  });

  it('keeps G11.21.2 currency inheritance and normalizes the code', () => {
    const form = buildCreateForm(paidTournament({ currency_code: ' sar ' }));
    expect(form.currency_code).toBe('SAR');
  });

  it('keeps EDIT seeding from the stored category values (never the tournament)', async () => {
    mockApi.listCompetitions.mockResolvedValue([
      oneCompetition(),
      oneCompetition({ id: 2, name: 'Teams', is_default: false, entry_fee: 25, registration_fee: 30, currency_code: 'SAR', waitlist_enabled: 1, can_deactivate: true }),
    ]);
    renderManager();
    await openEditForm(1);

    expect((screen.getByLabelText('Entry fee') as HTMLInputElement).value).toBe('25');
    expect((screen.getByLabelText('Currency') as HTMLInputElement).value).toBe('SAR');
    expect(screen.getByTestId('registration-fee-readonly')).toHaveTextContent('30 SAR');
    expect(screen.getByLabelText('Enable waitlist')).toBeChecked();
  });
});