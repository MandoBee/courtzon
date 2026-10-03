import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CompetitionManager, { buildCreateForm } from './CompetitionManager';

/**
 * G11.21.2 — Competition CURRENCY inheritance.
 *
 * BUG: the backend resolves `currency_code = input.currency_code ??
 * tournament.currency_code ?? 'EGP'`, but `EMPTY_FORM` hard-coded `'EGP'` and
 * `save()` ALWAYS submitted it, so the UI turned every inherited value into an
 * explicit override. A tournament denominated in SAR silently produced EGP
 * categories — players charged in the wrong currency. Real money bug.
 *
 * Fix mirrors G11.21.1: seed the CREATE form from the parent tournament. EDIT
 * mode must remain untouched — a category owns its own currency.
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
    t: (key: string, def?: string) => (typeof def === 'string' ? def : key),
  }),
}));

vi.mock('../../store/auth.store', () => ({
  useAuthStore: (selector: (s: { user: { permissions: string[] } }) => unknown) =>
    selector({ user: { permissions: ['*'] } }),
}));

/** A tournament the backend would inherit the currency from. */
function tournamentIn(overrides: Record<string, unknown> = {}) {
  return {
    id: tournamentId,
    name: 'G11.21.2 Cup',
    entry_fee: 0,
    registration_fee: 0,
    waitlist_enabled: 0,
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

function currencyInput() {
  return screen.getByLabelText('Currency') as HTMLInputElement;
}

async function openCreateForm() {
  const button = await screen.findByTestId('competition-create');
  await waitFor(() => expect(button).not.toBeDisabled());
  fireEvent.click(button);
  return currencyInput();
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.getTournament.mockResolvedValue(tournamentIn({ currency_code: 'EGP' }));
  mockApi.listCompetitions.mockResolvedValue([oneCompetition()]);
  mockApi.createCompetition.mockResolvedValue({ id: 2 });
  mockApi.updateCompetition.mockResolvedValue({ id: 2 });
  mockApi.deactivateCompetition.mockResolvedValue({ deactivated: true });
});

// ── Pure seeding logic ────────────────────────────────────────────────────────
describe('G11.21.2 buildCreateForm currency', () => {
  it('seeds SAR from a SAR tournament', () => {
    expect(buildCreateForm(tournamentIn({ currency_code: 'SAR' })).currency_code).toBe('SAR');
  });

  it('seeds USD from a USD tournament', () => {
    expect(buildCreateForm(tournamentIn({ currency_code: 'USD' })).currency_code).toBe('USD');
  });

  it('falls back to EGP when the tournament currency is missing, null, empty or blank', () => {
    for (const currency of [undefined, null, '', '   ']) {
      const form = buildCreateForm(tournamentIn({ currency_code: currency }));
      expect(form.currency_code).toBe('EGP');
    }
    // Also when the tournament row is entirely unknown.
    expect(buildCreateForm(null).currency_code).toBe('EGP');
    expect(buildCreateForm(undefined).currency_code).toBe('EGP');
    expect(buildCreateForm({}).currency_code).toBe('EGP');
  });

  it('normalises a lowercase / whitespace-padded tournament code', () => {
    expect(buildCreateForm(tournamentIn({ currency_code: 'sar' })).currency_code).toBe('SAR');
    expect(buildCreateForm(tournamentIn({ currency_code: ' SAR ' })).currency_code).toBe('SAR');
    expect(buildCreateForm(tournamentIn({ currency_code: 'usd' })).currency_code).toBe('USD');
  });

  it('does not disturb the G11.21.1 inherited fields', () => {
    const form = buildCreateForm(tournamentIn({
      currency_code: 'SAR', entry_fee: 350, registration_fee: 400, waitlist_enabled: 1,
    }));
    expect(form).toMatchObject({
      entry_fee: 350, registration_fee: 400, waitlist_enabled: true, currency_code: 'SAR',
    });
  });
});

// ── Component behaviour: CREATE ───────────────────────────────────────────────
describe('G11.21.2 CompetitionManager create form currency', () => {
  it('seeds the create form with the tournament SAR (the bug produced EGP)', async () => {
    mockApi.getTournament.mockResolvedValue(tournamentIn({ currency_code: 'SAR' }));
    renderManager();

    const currency = await openCreateForm();
    expect(currency.value).toBe('SAR');
  });

  it('seeds the create form with the tournament USD', async () => {
    mockApi.getTournament.mockResolvedValue(tournamentIn({ currency_code: 'USD' }));
    renderManager();

    const currency = await openCreateForm();
    expect(currency.value).toBe('USD');
  });

  it('submits the INHERITED currency in the create payload', async () => {
    mockApi.getTournament.mockResolvedValue(tournamentIn({ currency_code: 'SAR' }));
    renderManager();
    await openCreateForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Doubles' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockApi.createCompetition).toHaveBeenCalled());
    expect(mockApi.createCompetition.mock.calls[0][2]).toMatchObject({ currency_code: 'SAR' });
  });

  it('preserves an explicit user change SAR → USD', async () => {
    mockApi.getTournament.mockResolvedValue(tournamentIn({ currency_code: 'SAR' }));
    renderManager();
    const currency = await openCreateForm();
    expect(currency.value).toBe('SAR');

    fireEvent.change(currency, { target: { value: 'USD' } });
    expect(currency.value).toBe('USD');

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Doubles' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockApi.createCompetition).toHaveBeenCalled());
    expect(mockApi.createCompetition.mock.calls[0][2]).toMatchObject({ currency_code: 'USD' });
  });

  it('preserves a lowercase user edit by normalising it to uppercase', async () => {
    mockApi.getTournament.mockResolvedValue(tournamentIn({ currency_code: 'SAR' }));
    renderManager();
    const currency = await openCreateForm();

    fireEvent.change(currency, { target: { value: 'usd' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Doubles' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockApi.createCompetition).toHaveBeenCalled());
    expect(mockApi.createCompetition.mock.calls[0][2]).toMatchObject({ currency_code: 'USD' });
  });

  it('falls back to EGP in the form when the tournament has no currency', async () => {
    mockApi.getTournament.mockResolvedValue(tournamentIn({ currency_code: null }));
    renderManager();

    const currency = await openCreateForm();
    expect(currency.value).toBe('EGP');
  });
});

// ── EDIT mode must remain unchanged ───────────────────────────────────────────
describe('G11.21.2 CompetitionManager edit mode is unaffected', () => {
  it('seeds EDIT from the CATEGORY currency, never the tournament currency', async () => {
    mockApi.getTournament.mockResolvedValue(tournamentIn({ currency_code: 'SAR' }));
    mockApi.listCompetitions.mockResolvedValue([
      oneCompetition(),
      oneCompetition({ id: 2, name: 'Doubles', is_default: false, currency_code: 'USD' }),
    ]);
    renderManager();

    // Every category renders an Edit button, so target the second one.
    const editButtons = await screen.findAllByRole('button', { name: 'Edit' });
    expect(editButtons).toHaveLength(2);
    fireEvent.click(editButtons[1]);

    await waitFor(() => expect(screen.getByLabelText('Currency')).toBeInTheDocument());
    // The category's own USD wins — NOT the tournament's SAR.
    expect(currencyInput().value).toBe('USD');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockApi.updateCompetition).toHaveBeenCalled());
    expect(mockApi.createCompetition).not.toHaveBeenCalled();
    expect(mockApi.updateCompetition.mock.calls[0][3]).toMatchObject({ currency_code: 'USD' });
  });

  it('keeps a category EGP even when the tournament is SAR', async () => {
    mockApi.getTournament.mockResolvedValue(tournamentIn({ currency_code: 'SAR' }));
    mockApi.listCompetitions.mockResolvedValue([
      oneCompetition(),
      oneCompetition({ id: 2, name: 'Teams', is_default: false, currency_code: 'EGP' }),
    ]);
    renderManager();

    const editButtons = await screen.findAllByRole('button', { name: 'Edit' });
    fireEvent.click(editButtons[1]);

    await waitFor(() => expect(screen.getByLabelText('Currency')).toBeInTheDocument());
    expect(currencyInput().value).toBe('EGP');
  });

  it('allows an explicit currency edit in EDIT mode', async () => {
    mockApi.getTournament.mockResolvedValue(tournamentIn({ currency_code: 'SAR' }));
    mockApi.listCompetitions.mockResolvedValue([
      oneCompetition(),
      oneCompetition({ id: 2, name: 'Teams', is_default: false, currency_code: 'EGP' }),
    ]);
    renderManager();

    const editButtons = await screen.findAllByRole('button', { name: 'Edit' });
    fireEvent.click(editButtons[1]);
    await waitFor(() => expect(screen.getByLabelText('Currency')).toBeInTheDocument());

    fireEvent.change(currencyInput(), { target: { value: 'EUR' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockApi.updateCompetition).toHaveBeenCalled());
    expect(mockApi.updateCompetition.mock.calls[0][3]).toMatchObject({ currency_code: 'EUR' });
  });
});
