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
