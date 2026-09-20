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
  commissionPayload: { commissionRate: 0, planName: 'Standard Club' },
}));

vi.mock('../../../services/tournament', () => ({
  orgTournamentApi: __state.orgApi,
  bracketTypeApi: __state.bracketTypeApi,
}));

vi.mock('../../../services/api', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: __state.sportsPayload }), post: vi.fn() },
}));

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
  __state.orgApi.getSportFormats.mockResolvedValue({ data: [] });
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
  });

  it('the create form is submitted to the org-scoped endpoint only', async () => {
    const { orgApi } = __state;
    renderPage(['tournaments.create.name', 'tournaments.create.type', 'tournaments.create.sport']);
    await waitFor(() => expect(orgApi.getBracketTypes).toHaveBeenCalledWith('6'));
    await waitFor(() => expect(orgApi.getCommissionConfig).toHaveBeenCalledWith('6'));
  });
});