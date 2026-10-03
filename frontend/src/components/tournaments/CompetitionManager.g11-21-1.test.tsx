import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CompetitionManager, { buildCreateForm } from './CompetitionManager';

/**
 * G11.21.1 — CompetitionManager participation in tournament-level inheritance.
 *
 * BUG: the Create form seeded `entry_fee: 0` / `registration_fee: 0` /
 * `waitlist_enabled: false` and `save()` ALWAYS submitted them. The backend only
 * inherits when a field is ABSENT, so the UI converted every inherited value into
 * an explicit override — a tournament configured with an entry fee silently
 * produced FREE categories (revenue loss) and its waitlist was silently off.
 *
 * These tests pin both halves of the fix: the pure seeding logic
 * (`buildCreateForm`) and the real component behaviour (seed → submit payload).
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
  // Wildcard so every <Can> gate renders (create / update / deactivate).
  useAuthStore: (selector: (s: { user: { permissions: string[] } }) => unknown) =>
    selector({ user: { permissions: ['*'] } }),
}));

/** A tournament the backend would inherit from. */
function paidTournament(overrides: Record<string, unknown> = {}) {
  return {
    id: tournamentId,
    name: 'G11.21.1 Cup',
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

/** Wait for the tournament config query, then open the Create form. */
async function openCreateForm() {
  const button = await screen.findByTestId('competition-create');
  await waitFor(() => expect(button).not.toBeDisabled());
  fireEvent.click(button);
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

// ── Pure seeding logic ────────────────────────────────────────────────────────
describe('G11.21.1 buildCreateForm', () => {
  it('inherits entry_fee, registration_fee and waitlist_enabled from the tournament', () => {
    const form = buildCreateForm(paidTournament());
    expect(form.entry_fee).toBe(350);
    expect(form.registration_fee).toBe(400);
    expect(form.waitlist_enabled).toBe(true);
  });

  it('falls back to the tournament entry_fee when it has no registration_fee', () => {
    const form = buildCreateForm({ entry_fee: 250, registration_fee: null, waitlist_enabled: 0 });
    expect(form.entry_fee).toBe(250);
    expect(form.registration_fee).toBe(250);
  });

  it('treats an explicit tournament 0 fee as 0, never as "unset"', () => {
    const form = buildCreateForm({ entry_fee: 0, registration_fee: 0, waitlist_enabled: 0 });
    expect(form.entry_fee).toBe(0);
    expect(form.registration_fee).toBe(0);
    expect(form.waitlist_enabled).toBe(false);
  });

  it('normalises the tinyint waitlist WITHOUT leaking a number into the boolean', () => {
    // Regression guard: `0 || false` / `1 || false` style coercion is wrong, and
    // `Number(1)` leaking in would make the checkbox `checked={1}`.
    expect(buildCreateForm({ waitlist_enabled: 1 }).waitlist_enabled).toBe(true);
    expect(buildCreateForm({ waitlist_enabled: 0 }).waitlist_enabled).toBe(false);
    expect(buildCreateForm({ waitlist_enabled: true }).waitlist_enabled).toBe(true);
    expect(buildCreateForm({ waitlist_enabled: false }).waitlist_enabled).toBe(false);
    expect(typeof buildCreateForm({ waitlist_enabled: 1 }).waitlist_enabled).toBe('boolean');
  });

  it('degrades safely to the free defaults when the tournament is unknown', () => {
    for (const t of [null, undefined, {}]) {
      const form = buildCreateForm(t);
      expect(form.entry_fee).toBe(0);
      expect(form.registration_fee).toBe(0);
      expect(form.waitlist_enabled).toBe(false);
    }
  });

  it('leaves the non-inherited defaults untouched', () => {
    const form = buildCreateForm(paidTournament());
    expect(form.competition_type).toBe('singles');
    expect(form.name).toBe('');
    expect(form.price_type).toBe('FIXED');
    expect(form.max_participants).toBe('');
    expect(form.min_participants).toBe(2);
    // G11.21.2: `currency_code` is no longer a fixed default — it is inherited
    // from the tournament, so it is deliberately NOT asserted here. It has its
    // own suite in CompetitionManager.g11-21-2.test.tsx.
  });
});

// ── Component behaviour ───────────────────────────────────────────────────────
describe('G11.21.1 CompetitionManager create form', () => {
  it('seeds the create form from the tournament configuration', async () => {
    renderManager();

    const entryFee = await openCreateForm();
    expect(entryFee.value).toBe('350');
    expect(screen.getByLabelText('Enable waitlist')).toBeChecked();
  });

  it('submits the INHERITED fee and waitlist (the bug produced 0/false here)', async () => {
    renderManager();
    await openCreateForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Doubles' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockApi.createCompetition).toHaveBeenCalled());
    const payload = mockApi.createCompetition.mock.calls[0][2];
    expect(payload.entry_fee).toBe(350);
    expect(payload.registration_fee).toBe(400);
    expect(payload.waitlist_enabled).toBe(true);
  });

  it('preserves an explicit user edit of the entry fee', async () => {
    renderManager();
    const entryFee = await openCreateForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Doubles' } });
    fireEvent.change(entryFee, { target: { value: '99' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockApi.createCompetition).toHaveBeenCalled());
    const payload = mockApi.createCompetition.mock.calls[0][2];
    expect(payload.entry_fee).toBe(99);
    // The waitlist the operator never touched is still inherited.
    expect(payload.waitlist_enabled).toBe(true);
  });

  it('preserves an explicit waitlist_enabled = false (never coerced back on)', async () => {
    renderManager();
    await openCreateForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Doubles' } });
    // The operator deliberately turns the INHERITED waitlist OFF.
    fireEvent.click(screen.getByLabelText('Enable waitlist'));
    expect(screen.getByLabelText('Enable waitlist')).not.toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockApi.createCompetition).toHaveBeenCalled());
    const payload = mockApi.createCompetition.mock.calls[0][2];
    // Must be exactly false — not undefined, not null, not 1.
    expect(payload.waitlist_enabled).toBe(false);
    expect(typeof payload.waitlist_enabled).toBe('boolean');
    expect(payload.entry_fee).toBe(350);
  });

  it('does not open a create form seeded with fallback zeros while the tournament loads', async () => {
    let release: (v: unknown) => void = () => {};
    mockApi.getTournament.mockReturnValue(new Promise((res) => { release = res; }));
    renderManager();

    const button = await screen.findByTestId('competition-create');
    // Guard rail: while the inherited config is unknown, creating is blocked.
    expect(button).toBeDisabled();

    release(paidTournament());
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it('a FREE tournament still creates a free category', async () => {
    mockApi.getTournament.mockResolvedValue(
      paidTournament({ entry_fee: 0, registration_fee: 0, waitlist_enabled: 0 }),
    );
    renderManager();
    await openCreateForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Free' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockApi.createCompetition).toHaveBeenCalled());
    const payload = mockApi.createCompetition.mock.calls[0][2];
    expect(payload.entry_fee).toBe(0);
    expect(payload.registration_fee).toBe(0);
    expect(payload.waitlist_enabled).toBe(false);
  });
});

// ── Edit mode must be unaffected ──────────────────────────────────────────────
describe('G11.21.1 CompetitionManager edit mode is unaffected', () => {
  it('seeds the edit form from the CATEGORY, never from the tournament', async () => {
    mockApi.listCompetitions.mockResolvedValue([
      oneCompetition(),
      oneCompetition({
        id: 2,
        name: 'Doubles',
        is_default: false,
        entry_fee: 25,
        registration_fee: 30,
        waitlist_enabled: 0,
        currency_code: 'SAR',
        can_deactivate: true,
      }),
    ]);
    renderManager();

    // EVERY category in the list renders an Edit button (the default included),
    // so target the second one explicitly rather than by unique role name.
    const editButtons = await screen.findAllByRole('button', { name: 'Edit' });
    expect(editButtons).toHaveLength(2);
    fireEvent.click(editButtons[1]);

    await waitFor(() => expect(screen.getByLabelText('Entry fee')).toBeInTheDocument());
    const entryFee = screen.getByLabelText('Entry fee') as HTMLInputElement;
    // The category's own values win — NOT the tournament's 350/400.
    expect(entryFee.value).toBe('25');
    expect(screen.getByLabelText('Enable waitlist')).not.toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockApi.updateCompetition).toHaveBeenCalled());
    expect(mockApi.createCompetition).not.toHaveBeenCalled();
    expect(mockApi.updateCompetition.mock.calls[0][3]).toMatchObject({
      entry_fee: 25,
      registration_fee: 30,
      waitlist_enabled: false,
    });
  });

  it('does not re-seed the form from the tournament when Edit is used', async () => {
    mockApi.listCompetitions.mockResolvedValue([
      oneCompetition(),
      oneCompetition({ id: 2, name: 'Teams', is_default: false, entry_fee: 0, waitlist_enabled: 1 }),
    ]);
    renderManager();

    const editButtons = await screen.findAllByRole('button', { name: 'Edit' });
    fireEvent.click(editButtons[1]);
    await waitFor(() => expect(screen.getByLabelText('Entry fee')).toBeInTheDocument());
    // Category is free, tournament charges 350 — edit must show 0.
    expect((screen.getByLabelText('Entry fee') as HTMLInputElement).value).toBe('0');
    expect(screen.getByLabelText('Enable waitlist')).toBeChecked();
  });
});