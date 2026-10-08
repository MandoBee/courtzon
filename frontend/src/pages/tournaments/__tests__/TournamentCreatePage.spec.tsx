import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, type RenderResult } from '@testing-library/react';
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
  sportsPayload: [
    { id: 22, name: 'Padel' },
    { id: 21, name: 'Tennis' },
  ],
  // Step 5B — authoritative backend option contract (capability + creation + GSK registry).
  bracketTypesPayload: {
    data: [
      { id: 1, name: 'Single Elimination', slug: 'single-elimination', is_active: 1, config_schema: null, engine_capability: 'ready', creation_available: true },
      { id: 2, name: 'Double Elimination', slug: 'double-elimination', is_active: 1, config_schema: null, engine_capability: 'planned', creation_available: false },
      { id: 3, name: 'Round Robin', slug: 'round-robin', is_active: 1, config_schema: null, engine_capability: 'ready', creation_available: true },
      { id: 4, name: 'Swiss', slug: 'swiss', is_active: 1, config_schema: null, engine_capability: 'planned', creation_available: false },
    ],
    registry: [
      { format: 'group_stage_knockout', name: 'Group Stage + Knockout', type: 'composite', source: 'engine_registry', engine_capability: 'ready', creation_available: true, toggleable: false, substrate: 'single-elimination', description: 'Group stage + knockout composite' },
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
  organisationListPayload: { data: [
    { id: 99, name: 'G11 Org A', country_code: 'AE' },
    { id: 6, name: 'Padel Edge', country_code: 'AE' },
  ] },
  postError: null as null | Error,
}));

vi.mock('../../../services/tournament', () => ({
  orgTournamentApi: __state.orgApi,
}));

vi.mock('../../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
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
      {error && <p role="alert">{error}</p>}
    </div>
  ),
  Card: ({ children }: any) => <div>{children}</div>,
}));

function renderPage(permissions: string[], mode: 'org' | 'admin' = 'org') {
  __state.userPermissions = permissions;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TournamentCreatePage mode={mode} orgId={mode === 'org' ? '6' : undefined} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const ALL = [
  'org.tournaments.create',
  'tournament.create.organisation',
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
];

const continueBtn = () => screen.getByRole('button', { name: /tournaments\.wizard\.continue/ });
const backBtn = () => screen.getByRole('button', { name: 'common.back' });

function fieldInput(labelKey: string): HTMLInputElement {
  const el = screen.getByText(labelKey).nextElementSibling;
  if (!el) throw new Error(`No input found after label ${labelKey}`);
  return el as HTMLInputElement;
}

function selectByOptionText(view: RenderResult, optionText: string, value: string) {
  const sel = Array.from(view.container.querySelectorAll('select')).find((s) =>
    Array.from(s.querySelectorAll('option')).some((o) => (o.textContent || '').includes(optionText)),
  );
  if (!sel) throw new Error(`No select containing option "${optionText}"`);
  fireEvent.change(sel!, { target: { value } });
}

/** Wait until the Single Elimination card is enabled (bracket types loaded), then select it. */
async function clickSingleElimination() {
  const card = await screen.findByTestId('format-card-single-elimination');
  await waitFor(() => expect((card as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(card);
}

/** Continue and wait until the wizard reaches the given step (mobile header "Step N of 8"). */
async function clickContinueAndAwait(stepNo: number) {
  fireEvent.click(continueBtn());
  await screen.findByText(`Step ${stepNo} of 8`);
}

/** Fill a full valid walk to the given step index (0-based). */
async function walkTo(stepIndex: number) {
  fireEvent.change(fieldInput('tournaments.create.name'), { target: { value: 'UAT Wizard Cup' } });
  await clickContinueAndAwait(2); // Format
  await clickSingleElimination();
  await clickContinueAndAwait(3); // Participants
  fireEvent.change(fieldInput('tournaments.create.max_players'), { target: { value: '8' } });
  await clickContinueAndAwait(4); // Schedule
  fireEvent.change(fieldInput('tournaments.create.start_date'), { target: { value: '2026-10-01' } });
  await clickContinueAndAwait(5); // Rules
  await clickContinueAndAwait(6); // Payments
  await clickContinueAndAwait(7); // Prizes
  await clickContinueAndAwait(8); // Review
  for (let i = 7; i > stepIndex; i--) {
    fireEvent.click(backBtn());
    await screen.findByText(`Step ${i} of 8`);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  __state.postError = null;
  __state.orgApi.getBracketTypes.mockResolvedValue(__state.bracketTypesPayload);
  __state.orgApi.getCommissionConfig.mockResolvedValue(__state.commissionPayload);
  __state.orgApi.getSportFormats.mockResolvedValue(__state.formatsPayload);
  (api.get as any).mockImplementation((url: string) => {
    if (url.includes('/org/6/branches')) return Promise.resolve({ data: __state.branchesPayload });
    if (url.includes('/player-levels')) return Promise.resolve({ data: { data: [] } });
    if (url.includes('/organisations')) return Promise.resolve({ data: __state.organisationListPayload });
    return Promise.resolve({ data: __state.sportsPayload });
  });
  (api.post as any).mockImplementation(() =>
    __state.postError ? Promise.reject(__state.postError) : Promise.resolve({ data: { id: 1 } }),
  );
});

describe('Creation Wizard — shell, navigation and validation', () => {
  it('renders the wizard title, step indicator and the Basics step', async () => {
    renderPage(ALL);
    expect(screen.getByText('tournaments.create.title')).toBeTruthy();
    expect(screen.getByTestId('wizard-progress-desktop')).toBeTruthy();
    // Mobile compact header ("Step 1 of 8").
    expect(screen.getByText('Step 1 of 8')).toBeTruthy();
    expect(await screen.findByText('tournaments.create.name')).toBeTruthy();
    expect(screen.getByText('tournaments.create.description')).toBeTruthy();
    expect(continueBtn()).toBeTruthy();
  });

  it('prevented from advancing when the required name is missing', async () => {
    renderPage(ALL);
    fireEvent.click(continueBtn());
    expect(await screen.findByText('tournaments.create.validation.name')).toBeTruthy();
    // Still on Basics — the Format step has not mounted.
    expect(screen.queryByTestId('format-card-single-elimination')).toBeNull();
  });

  it('back navigation returns to the previous step preserving form state', async () => {
    const view = renderPage(ALL);
    fireEvent.change(fieldInput('tournaments.create.name'), { target: { value: 'Back Cup' } });
    fireEvent.click(continueBtn());
    expect(await screen.findByTestId('format-card-single-elimination')).toBeTruthy();
    fireEvent.click(backBtn());
    expect(await screen.findByText('tournaments.create.name')).toBeTruthy();
    expect((fieldInput('tournaments.create.name') as HTMLInputElement).value).toBe('Back Cup');
    expect(view.container.textContent).toContain('tournaments.create.description');
  });

  it('valid step data advances to the next step', async () => {
    renderPage(ALL);
    fireEvent.change(fieldInput('tournaments.create.name'), { target: { value: 'Advance Cup' } });
    fireEvent.click(continueBtn());
    expect(await screen.findByTestId('format-card-single-elimination')).toBeTruthy();
  });

  it('walks the full wizard to the Review screen', async () => {
    renderPage(ALL);
    await walkTo(7);
    expect(screen.getByTestId('wizard-review')).toBeTruthy();
  });
});

describe('Creation Wizard — Format selector (engine capability states)', () => {
  it('shows all five target formats; only engine-executable ones are selectable', async () => {
    renderPage(ALL);
    fireEvent.change(fieldInput('tournaments.create.name'), { target: { value: 'Cup' } });
    fireEvent.click(continueBtn());
    for (const key of ['single-elimination', 'round-robin', 'double-elimination', 'swiss', 'group-stage-knockout']) {
      expect(await screen.findByTestId(`format-card-${key}`)).toBeTruthy();
    }
  });

  it('selecting an executable format shows its journey preview and enables Continue', async () => {
    renderPage(ALL);
    fireEvent.change(fieldInput('tournaments.create.name'), { target: { value: 'Cup' } });
    fireEvent.click(continueBtn());
    await clickSingleElimination();
    expect(screen.getByTestId('format-journey-preview')).toBeTruthy();
    // Selection is stored in the form (aria-pressed on the executable card).
    expect(screen.getByTestId('format-card-single-elimination').getAttribute('aria-pressed')).toBe('true');
  });

  it('planned formats (Double Elimination / Swiss) are not submitted; they explain engine preparation', async () => {
    renderPage(ALL);
    fireEvent.change(fieldInput('tournaments.create.name'), { target: { value: 'Cup' } });
    fireEvent.click(continueBtn());
    fireEvent.click(await screen.findByTestId('format-card-double-elimination'));
    expect(screen.getByTestId('format-planned-panel')).toBeTruthy();
    // No executable format is selected → Continue refuses to advance.
    fireEvent.click(continueBtn());
    await waitFor(() => expect(screen.getByText('tournaments.create.validation.bracket_type')).toBeTruthy());
  });

  it('Group Stage + Knockout is selectable and shows a valid GSK configuration', async () => {
    renderPage(ALL);
    fireEvent.change(fieldInput('tournaments.create.name'), { target: { value: 'Cup' } });
    fireEvent.click(continueBtn());
    const gskCard = await screen.findByTestId('format-card-group-stage-knockout');
    await waitFor(() => expect((gskCard as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(gskCard);
    expect(await screen.findByTestId('gsk-config')).toBeTruthy();
    expect(screen.getByTestId('gsk-valid')).toBeTruthy(); // defaults are valid
    // Continue advances — GSK writes the single-elimination bracket substrate.
    fireEvent.click(continueBtn());
    expect(await screen.findByText('tournaments.create.max_players')).toBeTruthy();
  });

  it('GSK rejects an invalid group configuration before continuing', async () => {
    renderPage(ALL);
    fireEvent.change(fieldInput('tournaments.create.name'), { target: { value: 'Cup' } });
    fireEvent.click(continueBtn());
    const gskCard = await screen.findByTestId('format-card-group-stage-knockout');
    await waitFor(() => expect((gskCard as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(gskCard);
    const groupCount = document.getElementById('gsk-group-count') as HTMLInputElement;
    fireEvent.change(groupCount, { target: { value: '0' } });
    expect((await screen.findAllByText('gsk.invalid.groupCount')).length).toBeGreaterThan(0);
    fireEvent.click(continueBtn());
    // Still on the Format step — no advancement.
    expect(screen.queryByText('tournaments.create.max_players')).toBeNull();
  });

  it('submits format=group_stage_knockout with gsk_config (and omits it for non-GSK)', async () => {
    renderPage(ALL);
    fireEvent.change(fieldInput('tournaments.create.name'), { target: { value: 'GSK Cup' } });
    await clickContinueAndAwait(2);
    const gskCard = await screen.findByTestId('format-card-group-stage-knockout');
    await waitFor(() => expect((gskCard as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(gskCard);
    await clickContinueAndAwait(3);
    await clickContinueAndAwait(4);
    fireEvent.change(fieldInput('tournaments.create.start_date'), { target: { value: '2026-10-01' } });
    await clickContinueAndAwait(5);
    await clickContinueAndAwait(6);
    await clickContinueAndAwait(7);
    await clickContinueAndAwait(8);
    fireEvent.click(screen.getByRole('button', { name: 'tournaments.create.submit' }));
    await waitFor(() => expect((api.post as any).mock.calls.length).toBeGreaterThan(0));
    const payload = (api.post as any).mock.calls[0][1] as any;
    expect(payload.format).toBe('group_stage_knockout');
    expect(payload.gsk_config).toBeTruthy();
    expect(payload.gsk_config.groupStage.groupCount).toBe(8);
    expect(payload.gsk_config.knockout.startingRound).toBe('round_of_16');
  });
});

describe('Creation Wizard — authoritative bracket capability (Step 5B alignment)', () => {
  const goToFormat = async () => {
    renderPage(ALL);
    fireEvent.change(fieldInput('tournaments.create.name'), { target: { value: 'Cup' } });
    fireEvent.click(continueBtn());
    await screen.findByTestId('format-card-single-elimination');
  };

  it('loads authoritative format data — Single Elimination and Round Robin availability comes from backend capability', async () => {
    await goToFormat();
    expect(__state.orgApi.getBracketTypes).toHaveBeenCalledWith('6');
    const se = screen.getByTestId('format-card-single-elimination') as HTMLButtonElement;
    const rr = screen.getByTestId('format-card-round-robin') as HTMLButtonElement;
    // engine_capability==='ready' + creation_available===true on the backend row → executable.
    expect(se.disabled).toBe(false);
    expect(rr.disabled).toBe(false);
    expect(se.textContent).toContain('tournaments.wizard.format.available');
  });

  it('Single Elimination is not executable when backend capability says not creation-available', async () => {
    __state.orgApi.getBracketTypes.mockResolvedValueOnce({
      data: [
        { id: 1, name: 'Single Elimination', slug: 'single-elimination', is_active: 1, config_schema: null, engine_capability: 'ready', creation_available: false },
        { id: 3, name: 'Round Robin', slug: 'round-robin', is_active: 1, config_schema: null, engine_capability: 'ready', creation_available: true },
      ],
      registry: [
        { format: 'group_stage_knockout', name: 'Group Stage + Knockout', type: 'composite', source: 'engine_registry', engine_capability: 'ready', creation_available: false, toggleable: false,
          substrate: 'single-elimination', description: 'Needs SE substrate' },
      ],
    });
    renderPage(ALL);
    fireEvent.change(fieldInput('tournaments.create.name'), { target: { value: 'Cup' } });
    fireEvent.click(continueBtn());
    // No SE card is offered as executable; the format the backend marks unavailable is not selectable.
    expect(await screen.findByTestId('format-card-round-robin')).toBeTruthy();
    expect(screen.queryByTestId('format-card-single-elimination')).toBeNull();
    // GSK is also unavailable (no single-elimination substrate) → not executable.
    const gsk = screen.getByTestId('format-card-group-stage-knockout');
    expect(gsk.getAttribute('aria-pressed')).toBe('false');
    // Nothing executable selected → Continue refuses to advance.
    fireEvent.click(continueBtn());
    await waitFor(() => expect(screen.getByText('tournaments.create.validation.bracket_type')).toBeTruthy());
  });

  it('Round Robin availability comes from backend capability', async () => {
    __state.orgApi.getBracketTypes.mockResolvedValueOnce({
      data: [
        { id: 1, name: 'Single Elimination', slug: 'single-elimination', is_active: 1, config_schema: null, engine_capability: 'ready', creation_available: true },
        { id: 3, name: 'Round Robin', slug: 'round-robin', is_active: 1, config_schema: null, engine_capability: 'ready', creation_available: false },
      ],
      registry: [
        { format: 'group_stage_knockout', name: 'Group Stage + Knockout', type: 'composite', source: 'engine_registry', engine_capability: 'ready', creation_available: true, toggleable: false, substrate: 'single-elimination' },
      ],
    });
    renderPage(ALL);
    fireEvent.change(fieldInput('tournaments.create.name'), { target: { value: 'Cup' } });
    fireEvent.click(continueBtn());
    expect(await screen.findByTestId('format-card-single-elimination')).toBeTruthy();
    expect(screen.queryByTestId('format-card-round-robin')).toBeNull();
  });

  it('GSK availability comes from the authoritative registry entry', async () => {
    await goToFormat();
    const gsk = screen.getByTestId('format-card-group-stage-knockout') as HTMLButtonElement;
    expect(gsk.disabled).toBe(false); // registry entry: engine_capability ready + creation_available true
    fireEvent.click(gsk);
    expect(await screen.findByTestId('gsk-config')).toBeTruthy();
  });

  it('Double Elimination is not executable when backend says planned', async () => {
    await goToFormat();
    const de = screen.getByTestId('format-card-double-elimination') as HTMLButtonElement;
    expect(de.getAttribute('aria-pressed')).toBe('false');
    expect(de.textContent).toContain('tournaments.wizard.format.engine_prep');
    fireEvent.click(de);
    expect(screen.getByTestId('format-planned-panel')).toBeTruthy();
    fireEvent.click(continueBtn());
    await waitFor(() => expect(screen.getByText('tournaments.create.validation.bracket_type')).toBeTruthy());
  });

  it('Swiss is not executable when backend says planned', async () => {
    await goToFormat();
    const swiss = screen.getByTestId('format-card-swiss') as HTMLButtonElement;
    expect(swiss.getAttribute('aria-pressed')).toBe('false');
    expect(swiss.textContent).toContain('tournaments.wizard.format.engine_prep');
    fireEvent.click(swiss);
    expect(screen.getByTestId('format-planned-panel')).toBeTruthy();
    fireEvent.click(continueBtn());
    await waitFor(() => expect(screen.getByText('tournaments.create.validation.bracket_type')).toBeTruthy());
  });

  it('an unknown registry entry does not become executable', async () => {
    __state.orgApi.getBracketTypes.mockResolvedValueOnce({
      data: [
        { id: 1, name: 'Single Elimination', slug: 'single-elimination', is_active: 1, config_schema: null, engine_capability: 'ready', creation_available: true },
        { id: 3, name: 'Round Robin', slug: 'round-robin', is_active: 1, config_schema: null, engine_capability: 'ready', creation_available: true },
      ],
      registry: [
        { format: 'mystery_composite', name: 'Mystery', type: 'composite', source: 'engine_registry', engine_capability: 'unsupported', creation_available: false, toggleable: false },
      ],
    });
    renderPage(ALL);
    fireEvent.change(fieldInput('tournaments.create.name'), { target: { value: 'Cup' } });
    fireEvent.click(continueBtn());
    await screen.findByTestId('format-card-single-elimination');
    // No authoritative group_stage_knockout registry entry → the card is present only as unavailable.
    const gsk = screen.getByTestId('format-card-group-stage-knockout');
    expect(gsk.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(gsk);
    expect(screen.getByTestId('format-planned-panel')).toBeTruthy();
    fireEvent.click(continueBtn());
    await waitFor(() => expect(screen.getByText('tournaments.create.validation.bracket_type')).toBeTruthy());
  });

  it('retains no hard-coded engine capability logic in the page', async () => {
    const { readFileSync } = require('node:fs');
    const src = readFileSync('src/pages/tournaments/TournamentCreatePage.tsx', 'utf8');
    expect(src).toContain('orgTournamentApi.getBracketTypes');
    expect(src).toContain('engine_capability');
    expect(src).toContain('creation_available');
    expect(src).toContain('bracketRegistry');
    // No fixed format list / local capability predicates remain.
    expect(src).not.toMatch(/bracketOptions\s*=\s*\[/);
    expect(src).not.toMatch(/executable\('single-elimination'\)/);
    expect(src).not.toContain("planned('double-elimination'");
    expect(src).not.toContain('isEngineSupported');
  });

  it('fail-safes when the capability API errors — nothing becomes selectable', async () => {
    __state.orgApi.getBracketTypes.mockRejectedValueOnce(new Error('bracket types down'));
    renderPage(ALL);
    fireEvent.change(fieldInput('tournaments.create.name'), { target: { value: 'Cup' } });
    fireEvent.click(continueBtn());
    expect(await screen.findByTestId('bracket-formats-error')).toBeTruthy();
    expect(screen.queryByTestId('format-card-single-elimination')).toBeNull();
    fireEvent.click(continueBtn());
    await waitFor(() => expect(screen.getByText('tournaments.create.validation.bracket_type')).toBeTruthy());
  });

  it('shows a loading state while the capability API is in flight', async () => {
    __state.orgApi.getBracketTypes.mockImplementationOnce(() => new Promise(() => {}));
    renderPage(ALL);
    fireEvent.change(fieldInput('tournaments.create.name'), { target: { value: 'Cup' } });
    fireEvent.click(continueBtn());
    expect(await screen.findByTestId('bracket-formats-loading')).toBeTruthy();
    expect(screen.queryByTestId('format-card-single-elimination')).toBeNull();
  });
});

describe('Creation Wizard — match format & rule set cascade', () => {
  it('match format and rule set populate from the sport cascade and preview derives from the rule set', async () => {
    const view = renderPage(ALL);
    fireEvent.change(fieldInput('tournaments.create.name'), { target: { value: 'Cup' } });
    fireEvent.click(continueBtn());
    await clickSingleElimination();

    // Sport → cascade request for the selected bracket (bracket passed through).
    await screen.findByText('Padel');
    selectByOptionText(view, 'Padel', '22');
    await waitFor(() => expect(__state.orgApi.getSportFormats).toHaveBeenCalledWith('6', '22', '1'));

    // Match format from the cascade.
    await screen.findByText('Padel Standard');
    selectByOptionText(view, 'Padel Standard', '1');
    const ruleSetSelect = Array.from(view.container.querySelectorAll('select')).find(
      (s) => Array.from(s.querySelectorAll('option')).some((o) => o.textContent === 'Padel Standard v1'),
    );
    expect(ruleSetSelect).toBeTruthy();
    fireEvent.change(ruleSetSelect!, { target: { value: '1' } });
    await clickContinueAndAwait(3); // Participants
    await clickContinueAndAwait(4); // Schedule
    fireEvent.change(fieldInput('tournaments.create.start_date'), { target: { value: '2026-10-01' } });
    await clickContinueAndAwait(5); // Rules
    // Rules step shows the server-derived humanReadable preview.
    expect(await screen.findByText(/Best of 3 sets/)).toBeTruthy();
    expect(screen.getByText(/Golden point at deuce/)).toBeTruthy();
    expect(screen.queryByText('tournaments.create.generated_rules_empty')).toBeNull();
  });
});

describe('Creation Wizard — participants, payments and editor steps', () => {
  it('min > max blocks progression on the Participants step', async () => {
    renderPage(ALL);
    await walkTo(2);
    fireEvent.change(fieldInput('tournaments.create.min_players'), { target: { value: '10' } });
    fireEvent.click(continueBtn());
    await waitFor(() => expect(screen.getByText('tournaments.wizard.validation.min_max')).toBeTruthy());
  });

  it('payments: free tournaments hide payment configuration; paid shows Cash/Card guards empties', async () => {
    const view = renderPage(ALL);
    await walkTo(5);
    // Free → payment methods hidden.
    expect(screen.getByText('tournaments.wizard.payments.free_note')).toBeTruthy();
    expect(screen.queryByText('tournaments.create.payment_methods')).toBeNull();
    expect(screen.getByText('EGP')).toBeTruthy(); // server-resolved currency

    // Paid → methods appear; removing both blocks Continue.
    fireEvent.change(fieldInput('tournaments.create.entry_fee'), { target: { value: '100' } });
    expect(await screen.findByText('tournaments.create.payment_methods')).toBeTruthy();
    const cash = screen.getByRole('checkbox', { name: 'tournaments.create.payment_cash' }) as HTMLInputElement;
    const card = screen.getByRole('checkbox', { name: 'tournaments.create.payment_card' }) as HTMLInputElement;
    expect(cash.checked).toBe(true);
    expect(card.checked).toBe(true);
    fireEvent.click(cash);
    fireEvent.click(card);
    fireEvent.click(continueBtn());
    await waitFor(() => expect(screen.getAllByText('tournaments.create.payment_methods_required').length).toBeGreaterThan(0));
    expect(view.container.textContent).toContain('tournaments.create.payment_methods');
  });

  it('prizes & sponsors step renders the editor surfaces', async () => {
    renderPage(ALL);
    await walkTo(6);
    expect(screen.getByText('tournaments.create.prize')).toBeTruthy(); // prize description
  });
});

describe('Creation Wizard — review & submit', () => {
  it('review shows all sections and Edit jumps back to the matching step', async () => {
    renderPage(ALL);
    await walkTo(7);
    const editButtons = screen.getAllByText('tournaments.wizard.review.edit');
    expect(editButtons.length).toBeGreaterThanOrEqual(7);
    fireEvent.click(editButtons[0]);
    expect(await screen.findByText('tournaments.create.name')).toBeTruthy();
  });

  it('submits through the org-scoped endpoint only (G11 Phase 3) with the full payload', async () => {
    const view = renderPage(ALL);
    // Walk with a branch + daily window so the payload is fully asserted.
    fireEvent.change(fieldInput('tournaments.create.name'), { target: { value: 'UAT Wizard Cup' } });
    await clickContinueAndAwait(2);
    await clickSingleElimination();
    await clickContinueAndAwait(3);
    fireEvent.change(fieldInput('tournaments.create.max_players'), { target: { value: '8' } });
    await clickContinueAndAwait(4);
    fireEvent.change(fieldInput('tournaments.create.start_date'), { target: { value: '2026-10-01' } });
    await screen.findByText(/Padel Edge City/);
    selectByOptionText(view, 'Padel Edge City', '5');
    const timeInputs = Array.from(view.container.querySelectorAll('input[type="time"]')) as HTMLInputElement[];
    fireEvent.change(timeInputs[0], { target: { value: '09:00' } });
    fireEvent.change(timeInputs[1], { target: { value: '21:00' } });
    await clickContinueAndAwait(5);
    await clickContinueAndAwait(6); // payments (free)
    await clickContinueAndAwait(7); // prizes
    await clickContinueAndAwait(8); // review
    fireEvent.click(screen.getByRole('button', { name: 'tournaments.create.submit' }));

    await waitFor(() => expect((api.post as any).mock.calls.length).toBeGreaterThan(0));
    const [url, payload] = (api.post as any).mock.calls[0] as [string, any];
    expect(url).toBe('/org/6/tournaments');
    expect(url).not.toContain('/admin/tournaments');
    expect(payload.name).toBe('UAT Wizard Cup');
    expect(payload.bracket_type_id).toBe(1);
    expect(payload.format).toBe('knockout');
    expect(payload.gsk_config).toBeUndefined();
    expect(payload.max_participants).toBe(8);
    expect(payload.start_date).toBe('2026-10-01');
    expect(payload.branch_id).toBe(5);
    expect(payload.daily_start_time).toBe('09:00:00');
    expect(payload.daily_end_time).toBe('21:00:00');
    expect(payload.price_type).toBe('FREE');
    expect(payload.registration_payment_methods).toEqual(['cash', 'card']);
    expect(payload.venue_type).toBe('ORGANISATION_COURTS');
    expect(payload.organisation_id).toBeUndefined();
    expect(payload.currency_code).toBeUndefined();
    expect(payload.commission_rate).toBeUndefined();
  });

  it('surfaces backend validation errors on the review screen', async () => {
    __state.postError = new Error('Server rejected the tournament');
    renderPage(ALL);
    await walkTo(7);
    fireEvent.click(screen.getByRole('button', { name: 'tournaments.create.submit' }));
    await waitFor(() => expect(screen.getByTestId('create-error-banner')).toBeTruthy());
    expect(screen.getByText(/Server rejected the tournament/)).toBeTruthy();
  });
});

describe('Creation Wizard — permissions', () => {
  it('only renders Basics fields the user is permitted to configure', async () => {
    renderPage(['org.tournaments.create', 'tournaments.create.name']);
    expect(await screen.findByText('tournaments.create.name')).toBeTruthy();
    // Category/season are gated by tournaments.create.type.
    expect(screen.queryByText('tournaments.create.category')).toBeNull();
    expect(screen.queryByText('tournaments.create.season')).toBeNull();
  });

  it('admin mode requires an owning organisation before proceeding', async () => {
    const view = renderPage(ALL, 'admin');
    await screen.findByText(/G11 Org A/);
    fireEvent.change(fieldInput('tournaments.create.name'), { target: { value: 'Admin Cup' } });
    fireEvent.click(continueBtn());
    // No org selected → still on Basics (validated below the picker).
    expect(await screen.findByText('tournaments.create.validation.organisation_required')).toBeTruthy();
    expect(screen.queryByTestId('format-card-single-elimination')).toBeNull();

    // Selecting the owning org enables the org-scoped reads and lets us continue.
    const orgSelect = Array.from(view.container.querySelectorAll('select')).find(
      (s) => Array.from(s.querySelectorAll('option')).some((o) => o.textContent?.includes('G11 Org A')),
    );
    expect(orgSelect).toBeTruthy();
    fireEvent.change(orgSelect!, { target: { value: '99' } });
    fireEvent.click(continueBtn());
    expect(await screen.findByTestId('format-card-single-elimination')).toBeTruthy();
  });
});

describe('Creation Wizard — motion & reduced motion', () => {
  it('uses the existing CSS motion system and disables it under prefers-reduced-motion', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../index.css');
    const css = readFileSync(root, 'utf8');
    expect(css).toContain('.cz-wizard-panel {');
    const reducedBlock = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reducedBlock).toContain('.cz-wizard-panel');
  });
});