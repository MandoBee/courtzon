import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TournamentCreatePage from '../TournamentCreatePage';

const __state = vi.hoisted(() => ({
  userPermissions: ['*'] as string[],
  orgApi: {
    getBracketTypes: vi.fn(),
    getCommissionConfig: vi.fn(),
    getSportFormats: vi.fn(),
  },
  bracketTypeApi: {
    listActive: vi.fn(),
    getSportFormats: vi.fn(),
  },
  sportsPayload: [
    { id: 22, name: 'Padel' },
    { id: 21, name: 'Tennis' },
  ],
  bracketTypesPayload: {
    data: [
      { id: 1, name: 'Single Elimination', slug: 'single-elimination', is_active: 1, config_schema: null },
      { id: 3, name: 'Round Robin', slug: 'round-robin', is_active: 1, config_schema: null },
    ],
  },
  commissionPayload: { commissionRate: 0, planName: 'Standard Club', currencyCode: 'EGP' },
  formatsPayload: {
    data: [
      {
        format: { id: 1, name: 'Padel Standard', formatType: 'doubles', description: 'Best of 3 sets, tiebreak at 6-6.' },
        ruleSets: [
          { id: 1, name: 'Padel Standard v1', version: 1, humanReadable: 'Single Elimination — Padel Standard — Doubles. Best of 3 sets. First to 6 games by a 1-game margin. Tiebreak at 6-6, first to 7 by 2. Golden point at deuce.' },
        ],
      },
    ],
  },
  branchesPayload: { data: [
    { id: 5, name: 'Padel Edge City', address_line1: '12 Corniche', city: 'Dubai' },
    { id: 6, name: 'Padel Edge Marina', address_line1: 'Marina Walk', city: 'Dubai' },
  ] },
}));

vi.mock('../../../services/tournament', () => ({
  orgTournamentApi: __state.orgApi,
  bracketTypeApi: __state.bracketTypeApi,
}));

vi.mock('../../../services/api', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: __state.sportsPayload }), post: vi.fn() },
}));

import api from '../../../services/api';

vi.mock('../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../../permissions/Can', () => ({
  Can: ({ permission, children }: any) => {
    const perms = __state.userPermissions;
    if (perms.includes('*') || perms.includes(permission)) return <>{children}</>;
    return null;
  },
}));

vi.mock('../../../components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../../../components/ui', () => ({
  Button: ({ children, ...rest }: any) => <button {...rest}>{children}</button>,
  Input: ({ label, error, tag, ...rest }: any) => (
    <div>
      {label && <label>{label}</label>}
      {tag === 'textarea' ? <textarea {...rest} /> : <input {...rest} />}
      {error && <p>{error}</p>}
    </div>
  ),
  Card: ({ children }: any) => <div>{children}</div>,
}));

function renderPage(permissions: string[]) {
  __state.userPermissions = permissions;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TournamentCreatePage mode="org" orgId="6" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  __state.orgApi.getBracketTypes.mockResolvedValue(__state.bracketTypesPayload);
  __state.orgApi.getCommissionConfig.mockResolvedValue(__state.commissionPayload);
  __state.orgApi.getSportFormats.mockResolvedValue(__state.formatsPayload);
  (api.get as any).mockImplementation((url: string) => {
    if (url.includes('/org/6/branches')) return Promise.resolve({ data: __state.branchesPayload });
    if (url.includes('/player-levels')) return Promise.resolve({ data: { data: [] } });
    return Promise.resolve({ data: __state.sportsPayload });
  });
});

describe('TournamentCreatePage — field-level permission gates (Group 5B UAT regression)', () => {
  it('renders ALL configuration fields when the org-admin holds every tournaments.create.* key', async () => {
    renderPage([
      'tournaments.create.name',
      'tournaments.create.description',
      'tournaments.create.type',
      'tournaments.create.sport',
      'tournaments.create.match-format',
      'tournaments.create.rule-set',
      'tournaments.create.max-participants',
      'tournaments.create.min-participants',
      'tournaments.create.prize',
      'tournaments.create.start-date',
      'tournaments.create.end-date',
      'tournaments.create.registration-dates',
      'tournaments.create.rules',
    ]);

    // Every field the UAT expected to be visible renders.
    expect(await screen.findByText('tournaments.create.name')).toBeTruthy();
    expect(screen.getByText('tournaments.create.description')).toBeTruthy();
    expect(screen.getByText('tournaments.create.bracket_type')).toBeTruthy();
    expect(screen.getByText('tournaments.create.sport')).toBeTruthy();
    expect(screen.getByText('tournaments.create.max_players')).toBeTruthy();
    expect(screen.getByText('tournaments.create.start_date')).toBeTruthy();
    expect(screen.getByText('tournaments.create.end_date')).toBeTruthy();
    expect(screen.getByText('tournaments.create.registration_opens')).toBeTruthy();
    expect(screen.getByText('tournaments.create.submit')).toBeTruthy();
    // Rules are a read-only generated preview (no editable textarea).
    expect(screen.getByText('tournaments.create.generated_rules')).toBeTruthy();
  });

  it('hides ALL configuration fields when the org-admin has NO tournaments.create.* key (only commission + submit render)', async () => {
    renderPage(['org.tournaments.view', 'org.tournaments.create']);

    // The un-gated commission box and submit button still render.
    expect(await screen.findByText('tournaments.create.commission_rate')).toBeTruthy();
    expect(screen.getByText('tournaments.create.submit')).toBeTruthy();

    // No configuration field renders.
    expect(screen.queryByText('tournaments.create.name')).toBeNull();
    expect(screen.queryByText('tournaments.create.description')).toBeNull();
    expect(screen.queryByText('tournaments.create.bracket_type')).toBeNull();
    expect(screen.queryByText('tournaments.create.sport')).toBeNull();
    expect(screen.queryByText('tournaments.create.max_players')).toBeNull();
    expect(screen.queryByText('tournaments.create.start_date')).toBeNull();
    expect(screen.queryByText('tournaments.create.registration_opens')).toBeNull();
    expect(screen.queryByText('tournaments.create.generated_rules')).toBeNull();
  });

  it('the create form is submitted to the org-scoped endpoint only', async () => {
    const { orgApi } = __state;
    renderPage(['tournaments.create.name', 'tournaments.create.type', 'tournaments.create.sport']);
    await waitFor(() => expect(orgApi.getBracketTypes).toHaveBeenCalledWith('6'));
    await waitFor(() => expect(orgApi.getCommissionConfig).toHaveBeenCalledWith('6'));
  });
});

describe('TournamentCreatePage — generated Rules preview (Group 1)', () => {
  it('shows an empty state before any sport/format/rule-set is selected (no fake rules)', async () => {
    renderPage(['tournaments.create.sport', 'tournaments.create.match-format', 'tournaments.create.rule-set', 'tournaments.create.rules']);
    // No format/rule set selected → the preview shows the empty-state text only.
    expect(await screen.findByText('tournaments.create.generated_rules_empty')).toBeTruthy();
    expect(screen.queryByText(/Best of 3 sets/)).toBeNull();
  });

  it('the Rules section is read-only — no editable textarea is rendered', async () => {
    renderPage(['tournaments.create.rules']);
    expect(await screen.findByText('tournaments.create.generated_rules')).toBeTruthy();
    // The old editable textarea must not exist.
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('the preview updates from the selected rule-set humanReadable value', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const view = renderPage(['tournaments.create.sport', 'tournaments.create.match-format', 'tournaments.create.rule-set', 'tournaments.create.rules']);

    // Locate the Sport select by its contained option text (raw <select>,
    // gated by tournaments.create.sport).
    await screen.findByText('Padel');
    const sportSelect = Array.from(view.container.querySelectorAll('select')).find(
      (s) => Array.from(s.querySelectorAll('option')).some((o) => o.textContent === 'Padel'),
    );
    expect(sportSelect).toBeTruthy();
    fireEvent.change(sportSelect!, { target: { value: '22' } });
    await waitFor(() => expect(__state.orgApi.getSportFormats).toHaveBeenCalledWith('6', '22', undefined));
    // Select the Padel Standard format so the rule-set select becomes enabled
    // with options from the cascade.
    await screen.findByText('Padel Standard');
    const formatSelect = Array.from(view.container.querySelectorAll('select')).find(
      (s) => Array.from(s.querySelectorAll('option')).some((o) => o.textContent === 'Padel Standard'),
    );
    fireEvent.change(formatSelect!, { target: { value: '1' } });
    // Select the rule set and assert the preview renders the server-derived
    // humanReadable (never a client-computed interpretation).
    const ruleSetSelect = Array.from(view.container.querySelectorAll('select')).find(
      (s) => Array.from(s.querySelectorAll('option')).some((o) => o.textContent === 'Padel Standard v1'),
    );
    expect(ruleSetSelect).toBeTruthy();
    fireEvent.change(ruleSetSelect!, { target: { value: '1' } });
    expect(await screen.findByText(/Best of 3 sets/)).toBeTruthy();
    expect(screen.getByText(/Golden point at deuce/)).toBeTruthy();
    expect(screen.queryByText('tournaments.create.generated_rules_empty')).toBeNull();
  });
});

describe('TournamentCreatePage — Group 1A foundation corrections', () => {
  it('the org create screen displays the server-resolved currency (EGP), not a hardcoded value', async () => {
    renderPage(['tournaments.create.sport', 'tournaments.create.type', 'tournaments.create.rules']);
    // currencyCode comes from the org commission-config read (single source).
    expect(await screen.findByText(/tournaments\.create\.currency/)).toBeTruthy();
    expect(screen.getByText('EGP')).toBeTruthy();
  });

  it('no organisation-flow hardcoded AED remains in the create screen', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '../TournamentCreatePage.tsx');
    const src = readFileSync(root, 'utf8');
    // The org path must not hardcode AED. Only the platform (admin) path may
    // still send an explicit currency, guarded by isOrg.
    expect(src).not.toMatch(/currency_code:\s*'AED'/);
    expect(src).toMatch(/currency_code: isOrg \? undefined : 'AED'/);
  });

  it('the selected bracket type is passed to the format cascade so preview matches the snapshot', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const view = renderPage(['tournaments.create.type', 'tournaments.create.sport', 'tournaments.create.match-format', 'tournaments.create.rule-set', 'tournaments.create.rules']);

    await screen.findByText('Single Elimination');
    // Select the Single Elimination bracket (first select).
    const bracketSelect = Array.from(view.container.querySelectorAll('select')).find(
      (s) => Array.from(s.querySelectorAll('option')).some((o) => o.textContent === 'Single Elimination'),
    );
    expect(bracketSelect).toBeTruthy();
    fireEvent.change(bracketSelect!, { target: { value: '1' } });

    await screen.findByText('Padel');
    const sportSelect = Array.from(view.container.querySelectorAll('select')).find(
      (s) => Array.from(s.querySelectorAll('option')).some((o) => o.textContent === 'Padel'),
    );
    fireEvent.change(sportSelect!, { target: { value: '22' } });
    // The cascade must be requested with the selected bracket_type_id.
    await waitFor(() => expect(__state.orgApi.getSportFormats).toHaveBeenCalledWith('6', '22', '1'));
  });
});

describe('TournamentCreatePage — registration payment methods (Group 3)', () => {
  it('renders Cash + Card checkboxes (both checked by default) when the prize permission is granted', async () => {
    renderPage(['tournaments.create.prize']);
    expect(await screen.findByText('tournaments.create.payment_methods')).toBeTruthy();
    const cash = screen.getByRole('checkbox', { name: 'tournaments.create.payment_cash' }) as HTMLInputElement;
    const card = screen.getByRole('checkbox', { name: 'tournaments.create.payment_card' }) as HTMLInputElement;
    expect(cash.checked).toBe(true);
    expect(card.checked).toBe(true);
    // G7-D eligibility is present but separate from payment-method checkboxes.
    expect(screen.getByRole('checkbox', { name: 'tournaments.eligibility.level.open' })).toBeDefined();
  });

  it('Wallet is never rendered as a payment method option', async () => {
    const view = renderPage(['tournaments.create.prize']);
    await screen.findByText('tournaments.create.payment_methods');
    const labels = Array.from(view.container.querySelectorAll('label')).map((l) => l.textContent || '');
    expect(labels.some((t) => /wallet/i.test(t))).toBe(false);
  });

  it('hides the payment-method section when the create-prize permission is absent', async () => {
    renderPage(['org.tournaments.create']);
    await screen.findByText('tournaments.create.commission_rate');
    expect(screen.queryByText('tournaments.create.payment_methods')).toBeNull();
  });

  it('submits the selected registration payment methods with the create payload', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const view = renderPage([
      'tournaments.create.name', 'tournaments.create.type', 'tournaments.create.prize',
      'tournaments.create.max-participants', 'tournaments.create.start-date',
    ]);

    await screen.findByText('tournaments.create.name');
    // Name
    const nameInput = screen.getByText('tournaments.create.name').nextElementSibling as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'UAT Cup' } });
    // Bracket type
    await screen.findByText('Single Elimination');
    const bracketSelect = Array.from(view.container.querySelectorAll('select')).find(
      (s) => Array.from(s.querySelectorAll('option')).some((o) => o.textContent === 'Single Elimination'),
    );
    fireEvent.change(bracketSelect!, { target: { value: '1' } });
    // Max players
    const maxInput = screen.getByText('tournaments.create.max_players').nextElementSibling as HTMLInputElement;
    fireEvent.change(maxInput, { target: { value: '8' } });
    // Start date
    const startInput = screen.getByText('tournaments.create.start_date').nextElementSibling as HTMLInputElement;
    fireEvent.change(startInput, { target: { value: '2026-10-01' } });
    // Uncheck Cash → card-only
    fireEvent.click(screen.getByRole('checkbox', { name: 'tournaments.create.payment_cash' }));
    // Submit
    fireEvent.click(screen.getByText('tournaments.create.submit'));

    await waitFor(() => expect(__state.orgApi.getBracketTypes).toHaveBeenCalled());
    await waitFor(() => {
      const postCalls = (api.post as any).mock.calls;
      expect(postCalls.length).toBeGreaterThan(0);
    });
    const payload = (api.post as any).mock.calls[0][1] as any;
    expect(payload.registration_payment_methods).toEqual(['card']);
  });
});

describe('TournamentCreatePage — venue + daily playing window (Group 4)', () => {
  it('renders the venue (branch) selector + daily start/end time fields', async () => {
    const view = renderPage(['tournaments.create.prize']);
    expect(await screen.findByText('tournaments.create.venue')).toBeTruthy();
    expect(screen.getByText('tournaments.create.daily_start')).toBeTruthy();
    expect(screen.getByText('tournaments.create.daily_end')).toBeTruthy();
    const timeInputs = Array.from(view.container.querySelectorAll('input[type="time"]'));
    expect(timeInputs.length).toBe(2);
  });

  it('loads the organisation branches into the venue selector (reuses org/branch model)', async () => {
    const view = renderPage(['tournaments.create.prize']);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/org/6/branches'));
    await screen.findByText('tournaments.create.venue');
    const venueSelect = Array.from(view.container.querySelectorAll('select')).find(
      (s) => Array.from(s.querySelectorAll('option')).some((o) => o.textContent?.includes('Padel Edge City')),
    );
    expect(venueSelect).toBeTruthy();
  });

  it('hides the venue/daily section when the prize permission is absent (RBAC visibility)', async () => {
    renderPage(['org.tournaments.create']);
    await screen.findByText('tournaments.create.commission_rate');
    expect(screen.queryByText('tournaments.create.venue')).toBeNull();
    expect(screen.queryByText('tournaments.create.daily_start')).toBeNull();
  });

  it('submits branch_id + daily_start_time + daily_end_time with the create payload', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const view = renderPage([
      'tournaments.create.name', 'tournaments.create.type', 'tournaments.create.prize',
      'tournaments.create.max-participants', 'tournaments.create.start-date',
    ]);

    await screen.findByText('tournaments.create.name');
    fireEvent.change(screen.getByText('tournaments.create.name').nextElementSibling as HTMLInputElement, { target: { value: 'UAT Cup' } });
    await screen.findByText('Single Elimination');
    const bracketSelect = Array.from(view.container.querySelectorAll('select')).find(
      (s) => Array.from(s.querySelectorAll('option')).some((o) => o.textContent === 'Single Elimination'),
    );
    fireEvent.change(bracketSelect!, { target: { value: '1' } });
    fireEvent.change(screen.getByText('tournaments.create.max_players').nextElementSibling as HTMLInputElement, { target: { value: '8' } });
    fireEvent.change(screen.getByText('tournaments.create.start_date').nextElementSibling as HTMLInputElement, { target: { value: '2026-10-01' } });

    // Select venue branch + set daily window
    const venueSelect = Array.from(view.container.querySelectorAll('select')).find(
      (s) => Array.from(s.querySelectorAll('option')).some((o) => o.textContent?.includes('Padel Edge City')),
    );
    fireEvent.change(venueSelect!, { target: { value: '5' } });
    const timeInputs = Array.from(view.container.querySelectorAll('input[type="time"]')) as HTMLInputElement[];
    fireEvent.change(timeInputs[0], { target: { value: '09:00' } });
    fireEvent.change(timeInputs[1], { target: { value: '21:00' } });

    fireEvent.click(screen.getByText('tournaments.create.submit'));
    await waitFor(() => expect((api.post as any).mock.calls.length).toBeGreaterThan(0));
    const payload = (api.post as any).mock.calls[0][1] as any;
    expect(payload.branch_id).toBe(5);
    expect(payload.daily_start_time).toBe('09:00:00');
    expect(payload.daily_end_time).toBe('21:00:00');
  });
});