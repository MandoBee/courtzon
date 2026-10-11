import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../../../components/ui/Toast';
import SportFormatsSection from '../SportFormatsSection';
import { sportConfigApi, type SportFormatRow } from '../../../../services/sportConfig';

/**
 * Phase 1 — a sport with ZERO formats must offer a first-format creation action
 * that reuses the existing `/admin/sports/:sportId/formats` API, respects the
 * `sports.formats.manage` gate, and keeps the existing `+ New Version` workflow
 * for sports that already have formats.
 */

const authState = vi.hoisted(() => ({ permissions: ['*'] as string[] }));

vi.mock('../../../../store/auth.store', () => ({
  useAuthStore: (selector?: (s: { user: { id: number; permissions: string[] } }) => unknown) =>
    selector
      ? selector({ user: { id: 1, permissions: authState.permissions as string[] } })
      : { user: { id: 1, permissions: authState.permissions as string[] } },
}));

vi.mock('../../../../services/sportConfig', () => ({
  sportConfigApi: {
    listFormats: vi.fn(),
    getFormat: vi.fn(),
    createFormat: vi.fn(),
    createRuleSet: vi.fn(),
    updateRuleSet: vi.fn(),
    activateRuleSet: vi.fn(),
    deactivateRuleSet: vi.fn(),
  },
}));

const api = vi.mocked(sportConfigApi);

const FMT: SportFormatRow = {
  id: 11,
  sportId: 1,
  sportName: 'Padel',
  slug: 'padel',
  name: 'Padel Singles',
  formatType: 'singles',
  playersPerSide: 1,
  rosterSize: null,
  description: null,
  isDefault: true,
  isActive: true,
  ruleSetCount: 1,
  referenceCount: 0,
};

const SPORT_ID = 1;
const WAIT = 4000;

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <SportFormatsSection sportId={SPORT_ID} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('SportFormatsSection — create the first format', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.permissions = ['*'];
    api.listFormats.mockReset();
    api.getFormat.mockReset();
    api.createFormat.mockReset();
    api.createFormat.mockResolvedValue({ ...FMT });
  });

  it('empty state shows a first-format creation action for authorized users', async () => {
    api.listFormats.mockResolvedValue([]);
    renderSection();

    expect(await screen.findByText(/No sport formats/i, {}, { timeout: WAIT })).toBeTruthy();
    const action = screen.getByTestId('create-first-format');
    expect(action).toBeTruthy();
    expect(action.textContent).toContain('New Format');
  });

  it('authorized creation calls the existing API and refreshes the displayed formats', async () => {
    api.listFormats.mockResolvedValueOnce([]).mockResolvedValue([FMT]);
    renderSection();

    fireEvent.click(await screen.findByTestId('create-first-format'));
    fireEvent.change(screen.getByTestId('format-name-input'), { target: { value: 'Padel' } });
    fireEvent.click(screen.getByTestId('create-first-format-submit'));

    await waitFor(
      () =>
        expect(api.createFormat).toHaveBeenCalledWith(
          SPORT_ID,
          expect.objectContaining({
            name: 'Padel',
            slug: 'padel',
            formatType: 'singles',
            isActive: true,
            isDefault: false,
          }),
        ),
      { timeout: WAIT },
    );
    // Invalidate → refetch shows the new format.
    expect(await screen.findByText(/Padel Singles/i, {}, { timeout: WAIT })).toBeTruthy();
    expect(await screen.findByText(/Sport format created/i, {}, { timeout: WAIT })).toBeTruthy();
  });

  it('API failure shows a clear error and allows retry without losing the form', async () => {
    api.listFormats.mockResolvedValueOnce([]).mockResolvedValue([FMT]);
    api.createFormat.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ ...FMT });
    renderSection();

    fireEvent.click(await screen.findByTestId('create-first-format'));
    fireEvent.change(screen.getByTestId('format-name-input'), { target: { value: 'Padel' } });
    fireEvent.click(screen.getByTestId('create-first-format-submit'));

    // Error toast; the modal stays open so the user can retry.
    expect(await screen.findByText('boom', {}, { timeout: WAIT })).toBeTruthy();
    expect(screen.getByTestId('create-first-format-submit')).toBeTruthy();
    fireEvent.click(screen.getByTestId('create-first-format-submit'));

    expect(await screen.findByText(/Padel Singles/i, {}, { timeout: WAIT })).toBeTruthy();
    expect(api.createFormat).toHaveBeenCalledTimes(2);
  });

  it('repeated clicks do not create duplicate requests', async () => {
    api.listFormats.mockResolvedValue([]);
    let resolveCreate: (v: SportFormatRow) => void = () => undefined;
    api.createFormat.mockImplementation(() => new Promise<SportFormatRow>((res) => { resolveCreate = res; }));
    renderSection();

    fireEvent.click(await screen.findByTestId('create-first-format'));
    fireEvent.change(screen.getByTestId('format-name-input'), { target: { value: 'Padel' } });

    const submit = screen.getByTestId('create-first-format-submit');
    fireEvent.click(submit);
    // The submit button is disabled while the request is pending.
    await waitFor(() => expect(submit).toBeDisabled(), { timeout: WAIT });
    fireEvent.click(submit);

    expect(api.createFormat).toHaveBeenCalledTimes(1);
    resolveCreate({ ...FMT });
  });

  it('existing formats retain the + New Version workflow and hide the first-format action', async () => {
    api.listFormats.mockResolvedValue([FMT]);
    api.getFormat.mockResolvedValue({ ...FMT, ruleSets: [] });
    renderSection();

    expect(screen.queryByTestId('create-first-format')).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: /Padel Singles/i }, { timeout: WAIT }));
    expect(await screen.findByText(/New Version/i, {}, { timeout: WAIT })).toBeTruthy();
  });

  it('unauthorized users cannot see the creation action', async () => {
    authState.permissions = [];
    api.listFormats.mockResolvedValue([]);
    renderSection();

    expect(await screen.findByText(/No sport formats/i, {}, { timeout: WAIT })).toBeTruthy();
    expect(screen.queryByTestId('create-first-format')).toBeNull();
  });
});