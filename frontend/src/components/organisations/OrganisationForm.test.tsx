import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OrganisationForm from './OrganisationForm';

const mockGet = vi.fn();
const mockPut = vi.fn();

vi.mock('../../services/api', () => ({
  default: { get: (...a: any[]) => mockGet(...a), put: (...a: any[]) => mockPut(...a) },
}));
vi.mock('../ui/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../permissions/Can', () => ({
  Can: ({ children }: { children: any }) => <>{children}</>,
}));

function orgRow(overrides: Record<string, any> = {}) {
  return {
    id: 6,
    name: 'Padel Edge',
    org_type_id: 2,
    country_id: 1,
    description: '',
    email: '',
    phone: '',
    website: '',
    is_active: 1,
    is_verified: 1,
    ...overrides,
  };
}

function renderForm(context: 'admin' | 'org' | 'seller', orgId = 6) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <OrganisationForm orgId={orgId} context={context} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

/** Editable controls expose their current value via input/select (read-only divs do not). */
function isFieldEditable(value: string): boolean {
  return !!screen.queryByDisplayValue(value);
}

describe('OrganisationForm identity fields (Name / Type / Country)', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPut.mockReset();
    mockGet.mockImplementation((url: string) => {
      if (url === '/organisation-types') return Promise.resolve({ data: { data: [{ id: 1, name: 'Club' }, { id: 2, name: 'Academy' }] } });
      if (url.includes('/info')) return Promise.resolve({ data: orgRow() });
      if (url.includes('/organisations/')) return Promise.resolve({ data: orgRow() });
      if (url.includes('/countries')) return Promise.resolve({ data: { data: [{ id: 1, name: 'Egypt', is_active: 1, iso_code: 'EG' }] } });
      return Promise.resolve({ data: { data: [] } });
    });
  });

  it('renders Name / Type / Country as READ-ONLY in org context', async () => {
    renderForm('org');
    await waitFor(() => expect(screen.getAllByText(/Padel Edge/).length).toBeGreaterThan(0));
    expect(isFieldEditable('Padel Edge')).toBe(false);
    expect(isFieldEditable('Academy')).toBe(false);
    expect(isFieldEditable('Egypt')).toBe(false);
  });

  it('renders Name / Type / Country as READ-ONLY in seller context', async () => {
    renderForm('seller');
    await waitFor(() => expect(screen.getAllByText(/Padel Edge/).length).toBeGreaterThan(0));
    expect(isFieldEditable('Padel Edge')).toBe(false);
    expect(isFieldEditable('Academy')).toBe(false);
    expect(isFieldEditable('Egypt')).toBe(false);
  });

  it('renders Name / Type / Country EDITABLE in admin context', async () => {
    renderForm('admin');
    await waitFor(() => expect(screen.getAllByText(/Padel Edge/).length).toBeGreaterThan(0));
    expect(isFieldEditable('Padel Edge')).toBe(true);
    expect(isFieldEditable('Academy')).toBe(true);
    expect(isFieldEditable('Egypt')).toBe(true);
  });
});

describe('G11.22 P0 — Club Access Model', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPut.mockReset();
    mockGet.mockImplementation((url: string) => {
      if (url === '/organisation-types') return Promise.resolve({ data: { data: [{ id: 1, name: 'Club' }] } });
      if (url.includes('/info') || url.includes('/organisations/')) {
        return Promise.resolve({ data: orgRow({ access_model: 'MEMBERSHIP_CLUB' }) });
      }
      return Promise.resolve({ data: { data: [] } });
    });
  });

  it('renders the saved Club Access Model from the organisation (org context)', async () => {
    renderForm('org');
    await waitFor(() => expect(screen.getAllByText(/Padel Edge/).length).toBeGreaterThan(0));
    expect(screen.getByLabelText('Club Access Model')).toBeTruthy();
    expect(isFieldEditable('Membership Club')).toBe(true);
  });

  it('submits the selected access model on save (org context)', async () => {
    renderForm('org');
    await waitFor(() => expect(screen.getAllByText(/Padel Edge/).length).toBeGreaterThan(0));
    const select = screen.getByLabelText('Club Access Model') as HTMLSelectElement;
    expect(select.value).toBe('MEMBERSHIP_CLUB');
    // Switch to Public Club and save.
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(select, { target: { value: 'PUBLIC_CLUB' } });
    fireEvent.click(screen.getByText('Save Changes'));
    await waitFor(() => expect(mockPut).toHaveBeenCalled());
    const payload = mockPut.mock.calls[0][1] as any;
    expect(payload.accessModel).toBe('PUBLIC_CLUB');
  });

  it('renders the Club Access Model field in admin context', async () => {
    renderForm('admin');
    await waitFor(() => expect(screen.getAllByText(/Padel Edge/).length).toBeGreaterThan(0));
    expect(screen.getByLabelText('Club Access Model')).toBeTruthy();
    expect(isFieldEditable('Membership Club')).toBe(true);
  });
});
