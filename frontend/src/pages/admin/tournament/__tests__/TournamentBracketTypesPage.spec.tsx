import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TournamentBracketTypesPage from '../TournamentBracketTypesPage';

const __state = vi.hoisted(() => ({
  showToast: vi.fn(),
  userPermissions: ['*'] as string[],
}));

vi.mock('../../../../services/api', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../../../permissions/Can', () => ({
  Can: ({ permission, children }: any) => {
    const perms = __state.userPermissions;
    if (perms.includes('*') || perms.includes(permission)) return <>{children}</>;
    return null;
  },
}));

vi.mock('../../../../components/ui/Toast', () => ({
  useToast: () => ({ showToast: __state.showToast }),
}));

import api from '../../../../services/api';

const SE = { id: 1, name: 'Single Elimination', slug: 'single-elimination', is_active: true, config_schema: '{"rounds":"auto","seeding":true}', referenced_count: 3, engine_capability: 'ready' as const, creation_available: true };
const DE = { id: 2, name: 'Double Elimination', slug: 'double-elimination', is_active: true, config_schema: '{"rounds":"auto","seeding":true,"losers_bracket":true}', referenced_count: 0, engine_capability: 'planned' as const, creation_available: false };
const RR = { id: 3, name: 'Round Robin', slug: 'round-robin', is_active: false, config_schema: '{"groups":4,"advance":2}', referenced_count: 0, engine_capability: 'ready' as const, creation_available: false };
const SW = { id: 4, name: 'Swiss System', slug: 'swiss', is_active: true, config_schema: '{"rounds":7,"pairing":"score-based"}', referenced_count: 0, engine_capability: 'planned' as const, creation_available: false };

const GSK = {
  format: 'group_stage_knockout',
  name: 'Group Stage + Knockout',
  type: 'composite',
  source: 'engine_registry',
  engine_capability: 'ready',
  creation_available: true,
  toggleable: false,
  substrate: 'single-elimination',
  description: 'Composite format — group stage + single-elimination knockout.',
};

const BODIES = { data: [SE, DE, RR, SW], registry: [GSK] };

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TournamentBracketTypesPage />
    </QueryClientProvider>,
  );
}

function tbody() {
  return within(document.querySelector('tbody') as HTMLElement);
}

function rowByName(name: string): HTMLElement {
  const rows = screen.getAllByRole('row');
  const found = rows.find((r) => (r.textContent || '').includes(name));
  expect(found, `row containing ${name}`).toBeTruthy();
  return found!;
}

beforeEach(() => {
  vi.clearAllMocks();
  __state.showToast.mockClear();
  (api.get as any).mockImplementation((url: string) => {
    if (url === '/admin/bracket-types') return Promise.resolve({ data: BODIES });
    if (typeof url === 'string' && url.startsWith('/admin/bracket-types/')) {
      const id = Number(url.split('/').pop());
      return Promise.resolve({
        data: {
          data: { ...SE, id, referenced_count: 3, active_references: 1, historical_references: 2, created_at: '2026-05-19T19:07:55.000Z' },
        },
      });
    }
    return Promise.resolve({ data: null });
  });
  (api.put as any).mockResolvedValue({ data: {} });
  (api.post as any).mockResolvedValue({ data: { data: { ...SE, id: 5, is_active: false } } });
  (api.delete as any).mockResolvedValue({ data: { success: true } });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('TournamentBracketTypesPage — Step 2A management UI', () => {
  it('1. renders DB-backed formats with capability + status + usage', async () => {
    renderPage();
    await screen.findByText('Single Elimination');
    expect(screen.getByText('Round Robin')).toBeTruthy();
    expect(screen.getByText('Double Elimination')).toBeTruthy();
    expect(screen.getByText('Swiss System')).toBeTruthy();
    // Engine + Status are distinct columns (scoped to the table body)
    const body = tbody();
    expect(body.getAllByText('Ready').length).toBeGreaterThanOrEqual(2); // SE + RR
    expect(body.getAllByText('Planned').length).toBe(2); // DE + SW
    expect(screen.getByText('Used by 3 tournament(s)')).toBeTruthy();
  });

  it('2. GSK registry row renders as a read-only composite', async () => {
    renderPage();
    await screen.findByText('Group Stage + Knockout');
    const gskRow = rowByName('Group Stage + Knockout');
    expect(within(gskRow).getByText('Composite')).toBeTruthy();
    expect(within(gskRow).getByText('GSK Engine Contract')).toBeTruthy();
    expect(within(gskRow).queryByRole('button', { name: 'Activate' })).toBeNull();
    expect(within(gskRow).queryByRole('button', { name: 'Deactivate' })).toBeNull();
    expect(within(gskRow).getByRole('button', { name: 'View Configuration' })).toBeTruthy();
  });

  it('3. DE/Swiss show Planned and Unavailable (never Active)', async () => {
    renderPage();
    await screen.findByText('Double Elimination');
    const deRow = rowByName('Double Elimination');
    expect(within(deRow).getByText('Planned')).toBeTruthy();
    expect(within(deRow).getByText('Unavailable')).toBeTruthy();
    expect(within(deRow).getByText('Engine not available yet.')).toBeTruthy();
    expect(within(deRow).queryByText('Active')).toBeNull();
  });

  it('4. Active (operational) is separate from Engine capability', async () => {
    renderPage();
    await screen.findByText('Single Elimination');
    const seRow = rowByName('Single Elimination');
    expect(within(seRow).getByText('Ready')).toBeTruthy();
    expect(within(seRow).getByText('Active')).toBeTruthy();
    const deRow = rowByName('Double Elimination');
    expect(within(deRow).getByText('Planned')).toBeTruthy();
    expect(within(deRow).queryByText('Active')).toBeNull();
  });

  it('5. filters: Engine Ready shows SE + RR + GSK only', async () => {
    renderPage();
    await screen.findByText('Single Elimination');
    fireEvent.click(screen.getByRole('button', { name: 'Engine Ready' }));
    expect(screen.getByText('Single Elimination')).toBeTruthy();
    expect(screen.getByText('Round Robin')).toBeTruthy();
    expect(screen.getByText('Group Stage + Knockout')).toBeTruthy();
    expect(tbody().queryByText('Double Elimination')).toBeNull();
    expect(tbody().queryByText('Swiss System')).toBeNull();
  });

  it('6. search by slug narrows results', async () => {
    renderPage();
    await screen.findByText('Single Elimination');
    fireEvent.change(screen.getByLabelText('Name or slug…'), { target: { value: 'swiss' } });
    expect(tbody().queryByText('Double Elimination')).toBeNull();
    expect(screen.getByText('Swiss System')).toBeTruthy();
  });

  it('7. zero usage is always visible', async () => {
    renderPage();
    await screen.findByText('Single Elimination');
    expect(screen.getAllByText('Used by 0 tournament(s)').length).toBeGreaterThanOrEqual(1);
  });

  it('8. GSK has NO activate/deactivate/delete actions', async () => {
    renderPage();
    await screen.findByText('Group Stage + Knockout');
    const gskRow = rowByName('Group Stage + Knockout');
    const buttons = within(gskRow).getAllByRole('button').map((b) => b.textContent);
    expect(buttons).toEqual(['View Configuration']);
  });

  it('9. planned formats have no activate action', async () => {
    renderPage();
    await screen.findByText('Double Elimination');
    for (const name of ['Double Elimination', 'Swiss System']) {
      const row = rowByName(name);
      expect(within(row).queryByRole('button', { name: 'Activate' })).toBeNull();
      expect(within(row).queryByRole('button', { name: 'Deactivate' })).toBeNull();
    }
  });

  it('10. ready formats show the correct actions (Deactivate when active, Activate when inactive)', async () => {
    renderPage();
    await screen.findByText('Single Elimination');
    const seRow = rowByName('Single Elimination'); // active
    expect(within(seRow).getByRole('button', { name: 'Deactivate' })).toBeTruthy();
    expect(within(seRow).queryByRole('button', { name: 'Activate' })).toBeNull();
    const rrRow = rowByName('Round Robin'); // inactive fixture
    expect(within(rrRow).getByRole('button', { name: 'Activate' })).toBeTruthy();
    expect(within(rrRow).queryByRole('button', { name: 'Deactivate' })).toBeNull();
  });

  it('11. view configuration modal shows stored schema (DB) and registry metadata (GSK)', async () => {
    renderPage();
    await screen.findByText('Single Elimination');
    fireEvent.click(within(rowByName('Single Elimination')).getByRole('button', { name: 'View' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Stored Schema')).toBeTruthy();
    expect(await within(dialog).findByText(/"seeding"/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));

    fireEvent.click(within(rowByName('Group Stage + Knockout')).getByRole('button', { name: 'View Configuration' }));
    const gskDialog = await screen.findByRole('dialog');
    expect(within(gskDialog).getByText('Composite')).toBeTruthy();
    expect(within(gskDialog).getByText('single-elimination')).toBeTruthy();
    expect(within(gskDialog).getByText(/group stage \+ single\-elimination knockout/i)).toBeTruthy();
  });

  it('12. deactivate requires confirmation and Cancel closes it', async () => {
    renderPage();
    await screen.findByText('Single Elimination');
    fireEvent.click(within(rowByName('Single Elimination')).getByRole('button', { name: 'Deactivate' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Deactivate Single Elimination?')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('13. a confirmed deactivate + success toast + invalidated refetch', async () => {
    renderPage();
    await screen.findByText('Single Elimination');
    fireEvent.click(within(rowByName('Single Elimination')).getByRole('button', { name: 'Deactivate' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/bracket-types/1', { is_active: false }), { timeout: 3000 });
    await waitFor(() => expect(__state.showToast).toHaveBeenCalledWith(expect.stringContaining('Bracket type updated'), 'success'), { timeout: 3000 });
    // list invalidated → refetched
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2), { timeout: 3000 });
  });

  it('13b. activate executes and refreshes the list', async () => {
    renderPage();
    await screen.findByText('Round Robin');
    fireEvent.click(within(rowByName('Round Robin')).getByRole('button', { name: 'Activate' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/bracket-types/3', { is_active: true }), { timeout: 3000 });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2), { timeout: 3000 });
  });

  it('14. backend error is surfaced as a clean toast (no raw error)', async () => {
    (api.put as any).mockRejectedValue({ isAxiosError: true, response: { data: { message: 'Cannot deactivate — active tournaments depend on it' } } });
    renderPage();
    await screen.findByText('Single Elimination');
    fireEvent.click(within(rowByName('Single Elimination')).getByRole('button', { name: 'Deactivate' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(api.put).toHaveBeenCalled(), { timeout: 3000 });
    await waitFor(() => expect(__state.showToast).toHaveBeenCalledWith(expect.stringContaining('Cannot deactivate'), 'error'), { timeout: 3000 });
  });

  it('15. loading state shows skeleton rows', async () => {
    let resolve!: (v: unknown) => void;
    (api.get as any).mockReturnValue(new Promise((r) => { resolve = r; }));
    renderPage();
    expect(document.querySelector('tbody')!.children.length).toBe(5);
    expect(screen.queryByText('Single Elimination')).toBeNull();
    resolve({ data: BODIES });
  });

  it('16. error state shows message + retry refetches', async () => {
    (api.get as any).mockRejectedValueOnce({ message: 'Network down' });
    renderPage();
    await screen.findByText('Unable to load bracket types.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('Single Elimination');
  });

  it('17. filtered-empty state explains and resets', async () => {
    renderPage();
    await screen.findByText('Single Elimination');
    fireEvent.change(screen.getByLabelText('Name or slug…'), { target: { value: 'zzzz-no-match' } });
    expect(screen.getByText('No bracket types match the current filters.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(screen.getByText('Single Elimination')).toBeTruthy();
  });

  it('18. table container uses controlled horizontal overflow (mobile-safe)', async () => {
    const { container } = renderPage();
    await screen.findByText('Single Elimination');
    const scrollHost = container.querySelector('.overflow-x-auto');
    expect(scrollHost).toBeTruthy();
    const table = scrollHost!.querySelector('table');
    expect(table).toBeTruthy();
  });

  it('19. accessibility basics: labelled table, dialog semantics, meaningful disabled state', async () => {
    renderPage();
    await screen.findByText('Single Elimination');
    const table = screen.getByRole('table');
    expect(table.getAttribute('aria-label')).toBe('Bracket Types');
    const deRow = rowByName('Double Elimination');
    expect(within(deRow).getByText('Engine not available yet.')).toBeTruthy();
    fireEvent.click(within(rowByName('Single Elimination')).getByRole('button', { name: 'View' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('20. summary metrics computed from the response', async () => {
    renderPage();
    await screen.findByText('Single Elimination');
    // Total 5 = 4 DB rows + 1 composite; Engine Ready 3 (SE, RR, GSK); Planned 2 (DE, SW)
    const metrics = screen.getAllByRole('listitem').map((el) => el.textContent);
    expect(JSON.stringify(metrics)).toContain('Total Formats');
    expect(JSON.stringify(metrics)).toContain('5');
    expect(JSON.stringify(metrics)).toContain('3');
    expect(JSON.stringify(metrics)).toContain('2');
  });
});

describe('TournamentBracketTypesPage — Step 2B-2 CRUD', () => {
  const openCreate = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Create Bracket Type' }));
    return screen.findByRole('dialog');
  };

  it('1. Create button is enabled', async () => {
    renderPage();
    await screen.findByText('Single Elimination');
    const btn = screen.getByRole('button', { name: 'Create Bracket Type' });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('2. Create modal opens with the three fields', async () => {
    renderPage();
    await screen.findByText('Single Elimination');
    const d = await openCreate();
    expect(within(d).getByLabelText('Name *')).toBeTruthy();
    expect(within(d).getByLabelText('Slug *')).toBeTruthy();
    expect(within(d).getByLabelText('Config Schema')).toBeTruthy();
  });

  it('3. required validation blocks submit', async () => {
    renderPage();
    await screen.findByText('Single Elimination');
    const d = await openCreate();
    fireEvent.click(within(d).getByRole('button', { name: 'Create' }));
    expect(within(d).getByText('Name is required.')).toBeTruthy();
    expect(within(d).getByText('Slug is required.')).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('4. invalid JSON config rejected client-side', async () => {
    renderPage();
    await screen.findByText('Single Elimination');
    const d = await openCreate();
    fireEvent.change(within(d).getByLabelText('Name *'), { target: { value: 'My Format' } });
    fireEvent.change(within(d).getByLabelText('Slug *'), { target: { value: 'my-format' } });
    fireEvent.change(within(d).getByLabelText('Config Schema'), { target: { value: '{ bad json' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Create' }));
    expect(within(d).getByText('Config Schema must be valid JSON.')).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('5. valid create calls POST (slug lowercased) and closes modal', async () => {
    renderPage();
    await screen.findByText('Single Elimination');
    const d = await openCreate();
    fireEvent.change(within(d).getByLabelText('Name *'), { target: { value: 'Speed Format' } });
    fireEvent.change(within(d).getByLabelText('Slug *'), { target: { value: 'Speed-Format' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/bracket-types', { name: 'Speed Format', slug: 'speed-format' }), { timeout: 3000 });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 3000 });
  });

  it('6. create success invalidates/refetches the list', async () => {
    renderPage();
    await screen.findByText('Single Elimination');
    const d = await openCreate();
    fireEvent.change(within(d).getByLabelText('Name *'), { target: { value: 'X' } });
    fireEvent.change(within(d).getByLabelText('Slug *'), { target: { value: 'x-format' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2), { timeout: 3000 });
    await waitFor(() => expect(__state.showToast).toHaveBeenCalledWith(expect.stringContaining('Bracket type created'), 'success'), { timeout: 3000 });
  });

  it('7. backend duplicate error is displayed inside the modal', async () => {
    (api.post as any).mockRejectedValue({ isAxiosError: true, response: { data: { code: 'TOURNAMENT_BRACKET_DUPLICATE', message: 'dupe' } } });
    renderPage();
    await screen.findByText('Single Elimination');
    const d = await openCreate();
    fireEvent.change(within(d).getByLabelText('Name *'), { target: { value: 'X' } });
    fireEvent.change(within(d).getByLabelText('Slug *'), { target: { value: 'swiss' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Create' }));
    expect(await within(d).findByText('A bracket type with this slug already exists.')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy(); // still open, values retained
  });

  it('8. backend unsupported error is displayed', async () => {
    (api.post as any).mockRejectedValue({ isAxiosError: true, response: { data: { code: 'TOURNAMENT_BRACKET_ENGINE_UNSUPPORTED', message: 'x' } } });
    renderPage();
    await screen.findByText('Single Elimination');
    const d = await openCreate();
    fireEvent.change(within(d).getByLabelText('Name *'), { target: { value: 'X' } });
    fireEvent.change(within(d).getByLabelText('Slug *'), { target: { value: 'weird-format' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Create' }));
    expect(await within(d).findByText(/engine is not available/i)).toBeTruthy();
  });

  it('9. View fetches GET-by-ID and renders detail fields', async () => {
    renderPage();
    await screen.findByText('Single Elimination');
    fireEvent.click(within(rowByName('Single Elimination')).getByRole('button', { name: 'View' }));
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByText('Creation Availability')).toBeTruthy();
    expect(within(d).getByText('Active References')).toBeTruthy();
    expect(within(d).getByText('Historical References')).toBeTruthy();
    expect(await within(d).findByText(/"seeding"/)).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/admin/bracket-types/1');
  });

  it('10. View shows a loading state while detail is pending', async () => {
    (api.get as any).mockImplementation((url: string) =>
      url.startsWith('/admin/bracket-types/')
        ? new Promise(() => {})
        : Promise.resolve({ data: BODIES }),
    );
    renderPage();
    await screen.findByText('Single Elimination');
    fireEvent.click(within(rowByName('Single Elimination')).getByRole('button', { name: 'View' }));
    const d = await screen.findByRole('dialog');
    expect(d.querySelector('tbody')).toBeNull();
    expect(d.querySelectorAll('.cz-skeleton').length).toBeGreaterThan(0);
  });

  it('13. View detail error state + retry', async () => {
    (api.get as any).mockImplementation((url: string) =>
      url.startsWith('/admin/bracket-types/')
        ? Promise.reject({ message: 'down' })
        : Promise.resolve({ data: BODIES }),
    );
    renderPage();
    await screen.findByText('Single Elimination');
    fireEvent.click(within(rowByName('Single Elimination')).getByRole('button', { name: 'View' }));
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByText('Unable to load bracket type details.')).toBeTruthy();
    // retry now resolves
    (api.get as any).mockImplementation((url: string) =>
      url.startsWith('/admin/bracket-types/')
        ? Promise.resolve({ data: { data: { ...SE, id: 1, referenced_count: 3, active_references: 1, historical_references: 2 } } })
        : Promise.resolve({ data: BODIES }),
    );
    fireEvent.click(within(d).getByRole('button', { name: 'Retry' }));
    expect(await within(d).findByText('Stored Schema')).toBeTruthy();
  });

  it('14. Edit opens with slug read-only', async () => {
    renderPage();
    await screen.findByText('Round Robin');
    fireEvent.click(within(rowByName('Round Robin')).getByRole('button', { name: 'Edit' }));
    const d = await screen.findByRole('dialog');
    expect(within(d).getByText('Edit Bracket Type')).toBeTruthy();
    expect(within(d).getByText('round-robin')).toBeTruthy();
  });

  it('15. slug is never an editable control', async () => {
    renderPage();
    await screen.findByText('Round Robin');
    fireEvent.click(within(rowByName('Round Robin')).getByRole('button', { name: 'Edit' }));
    const d = await screen.findByRole('dialog');
    expect(within(d).queryByLabelText('Slug')).toBeNull();
    expect(within(d).queryByPlaceholderText(/slug/i)).toBeNull();
  });

  it('16. PUT payload contains name/config only (no slug)', async () => {
    renderPage();
    await screen.findByText('Round Robin');
    fireEvent.click(within(rowByName('Round Robin')).getByRole('button', { name: 'Edit' }));
    const d = await screen.findByRole('dialog');
    fireEvent.change(within(d).getByLabelText('Name *'), { target: { value: 'Round Robin 2' } });
    fireEvent.change(within(d).getByLabelText('Config Schema'), { target: { value: '{"advance":3}' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.put).toHaveBeenCalled(), { timeout: 3000 });
    const call = (api.put as any).mock.calls.find((c: any[]) => c[0] === '/admin/bracket-types/3');
    expect(call).toBeTruthy();
    expect(call[1]).toEqual({ name: 'Round Robin 2', config_schema: '{"advance":3}' });
    expect((call[1] as any).slug).toBeUndefined();
  });

  it('17. successful edit refreshes data', async () => {
    renderPage();
    await screen.findByText('Round Robin');
    fireEvent.click(within(rowByName('Round Robin')).getByRole('button', { name: 'Edit' }));
    const d = await screen.findByRole('dialog');
    fireEvent.change(within(d).getByLabelText('Name *'), { target: { value: 'Round Robin 2' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2), { timeout: 3000 });
  });

  it('18. backend edit rejection keeps the modal open and shows the error', async () => {
    (api.put as any).mockRejectedValue({ isAxiosError: true, response: { data: { code: 'TOURNAMENT_BRACKET_IN_USE', message: 'ref' } } });
    renderPage();
    await screen.findByText('Single Elimination');
    fireEvent.click(within(rowByName('Single Elimination')).getByRole('button', { name: 'Edit' }));
    const d = await screen.findByRole('dialog');
    const nameInput = within(d).getByLabelText('Name *');
    fireEvent.change(nameInput, { target: { value: 'Single Elim 2' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Save' }));
    expect(await within(d).findByText('This format is in use and cannot be changed right now.')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect((nameInput as HTMLInputElement).value).toBe('Single Elim 2');
  });

  it('19. Activate calls PUT is_active true', async () => {
    renderPage();
    await screen.findByText('Round Robin');
    fireEvent.click(within(rowByName('Round Robin')).getByRole('button', { name: 'Activate' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/bracket-types/3', { is_active: true }), { timeout: 3000 });
  });

  it('22. dependency error on deactivate shows a friendly toast', async () => {
    (api.put as any).mockRejectedValue({ isAxiosError: true, response: { data: { code: 'TOURNAMENT_BRACKET_ENGINE_DEPENDENCY', message: 'dep' } } });
    renderPage();
    await screen.findByText('Single Elimination');
    fireEvent.click(within(rowByName('Single Elimination')).getByRole('button', { name: 'Deactivate' }));
    const d = await screen.findByRole('dialog');
    fireEvent.click(within(d).getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(__state.showToast).toHaveBeenCalledWith(expect.stringContaining('Deactivation is blocked'), 'error'), { timeout: 3000 });
  });

  it('23. removable (planned, zero-reference) rows show Remove', async () => {
    renderPage();
    await screen.findByText('Swiss System');
    expect(within(rowByName('Swiss System')).getByRole('button', { name: 'Remove' })).toBeTruthy();
    expect(within(rowByName('Double Elimination')).getByRole('button', { name: 'Remove' })).toBeTruthy();
  });

  it('24. canonical / executable rows do NOT show Remove', async () => {
    renderPage();
    await screen.findByText('Single Elimination');
    expect(within(rowByName('Single Elimination')).queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(within(rowByName('Round Robin')).queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('25. GSK does not show remove', async () => {
    renderPage();
    await screen.findByText('Group Stage + Knockout');
    const gskRow = rowByName('Group Stage + Knockout');
    expect(within(gskRow).queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(within(gskRow).queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('26. remove shows a confirmation dialog', async () => {
    renderPage();
    await screen.findByText('Swiss System');
    fireEvent.click(within(rowByName('Swiss System')).getByRole('button', { name: 'Remove' }));
    const d = await screen.findByRole('dialog');
    expect(within(d).getByText('Delete bracket type?')).toBeTruthy();
    expect(within(d).getByText(/Swiss System/)).toBeTruthy();
    expect(within(d).queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('27. DELETE request is sent after confirmation', async () => {
    renderPage();
    await screen.findByText('Swiss System');
    fireEvent.click(within(rowByName('Swiss System')).getByRole('button', { name: 'Remove' }));
    const d = await screen.findByRole('dialog');
    fireEvent.click(within(d).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/admin/bracket-types/4'), { timeout: 3000 });
  });

  it('28. successful removal refreshes data + toast', async () => {
    renderPage();
    await screen.findByText('Swiss System');
    fireEvent.click(within(rowByName('Swiss System')).getByRole('button', { name: 'Remove' }));
    const d = await screen.findByRole('dialog');
    fireEvent.click(within(d).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(__state.showToast).toHaveBeenCalledWith(expect.stringContaining('removed from active management'), 'success'), { timeout: 3000 });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2), { timeout: 3000 });
  });

  it('29. backend in-use/canonical error on remove is displayed and stays open', async () => {
    (api.delete as any).mockRejectedValue({ isAxiosError: true, response: { data: { code: 'TOURNAMENT_BRACKET_IN_USE', message: 'ref' } } });
    renderPage();
    await screen.findByText('Swiss System');
    fireEvent.click(within(rowByName('Swiss System')).getByRole('button', { name: 'Remove' }));
    const d = await screen.findByRole('dialog');
    fireEvent.click(within(d).getByRole('button', { name: 'Remove' }));
    expect(await within(d).findByText('This format is in use and cannot be changed right now.')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('35. accessibility: create dialog is an accessible modal', async () => {
    renderPage();
    await screen.findByText('Single Elimination');
    const d = await openCreate();
    expect(d.getAttribute('role')).toBe('dialog');
    expect(d.getAttribute('aria-modal')).toBe('true');
    fireEvent.keyDown(d, { key: 'Escape', code: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});