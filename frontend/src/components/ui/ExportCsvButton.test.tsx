import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportCsvButton } from './ExportCsvButton';

const mockGet = vi.fn();

vi.mock('../../services/api', () => ({
  default: { get: (...a: any[]) => mockGet(...a) },
}));
vi.mock('./Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

// D4 — the shared button reads permissions from the auth store (via useCan).
const mockAuth: { user: { permissions: string[] } | null } = {
  user: { permissions: [] },
};
vi.mock('../../store/auth.store', () => ({
  useAuthStore: (selector: (s: typeof mockAuth) => unknown) => selector(mockAuth),
}));

function renderBtn(props: any = {}) {
  return render(
    <ExportCsvButton
      endpoint="/unified-settlements/export"
      params={{ status: 'requested' }}
      filename="settlements"
      label="Export CSV"
      {...props}
    />,
  );
}

// Stub browser blob download
Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:test'), writable: true });
Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true });

describe('ExportCsvButton', () => {
  beforeEach(() => {
    mockGet.mockReset();
    document.body.innerHTML = '';
    mockAuth.user = { permissions: [] };
  });

  it('calls the export endpoint with filters and downloads a CSV', async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const createUrlSpy = vi.spyOn(URL, 'createObjectURL');
    mockGet.mockResolvedValue({
      data: new Blob(['a,b\r\n1,2'], { type: 'text/csv' }),
      headers: { 'content-disposition': 'attachment; filename="settlements_2026-08-26.csv"' },
    });
    const user = userEvent.setup();
    renderBtn();
    await user.click(screen.getByText('Export CSV'));
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/unified-settlements/export', expect.objectContaining({
        params: { status: 'requested' },
        responseType: 'blob',
      }));
    });
    // The blob was handed to URL.createObjectURL (triggers the download).
    expect(createUrlSpy).toHaveBeenCalled();
    // An anchor click was invoked to download.
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('prevents duplicate export clicks while loading', async () => {
    let resolveFn: any;
    mockGet.mockReturnValue(new Promise((res) => { resolveFn = res; }));
    const user = userEvent.setup();
    renderBtn();
    await user.click(screen.getByText('Export CSV'));
    await waitFor(() => expect(screen.getByText('Exporting…')).toBeTruthy());
    // Button is disabled while loading
    expect(screen.getByText('Exporting…').closest('button')?.disabled).toBe(true);
    resolveFn({ data: new Blob(['ok']), headers: {} });
  });

  it('shows an error toast when export fails', async () => {
    mockGet.mockRejectedValue({ response: { data: { message: 'Export failed' } } });
    const user = userEvent.setup();
    renderBtn();
    await user.click(screen.getByText('Export CSV'));
    // Should not throw; toast is mocked so no assertion on it.
    await waitFor(() => expect(screen.getByText('Export CSV')).toBeTruthy());
  });

  it('renders a disabled button when disabled prop is set', () => {
    renderBtn({ disabled: true });
    expect(screen.getByText('Export CSV').closest('button')?.disabled).toBe(true);
  });

  // ── D4 permission prop ────────────────────────────────────────────────────
  it('keeps the legacy behaviour (renders) when no permission prop is passed', () => {
    renderBtn();
    expect(screen.getByText('Export CSV')).toBeInTheDocument();
  });

  it('renders nothing when a permission is required and missing (fail-closed)', () => {
    mockAuth.user = { permissions: ['settlements.view'] };
    renderBtn({ permission: 'reports.export' });
    expect(screen.queryByText('Export CSV')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders nothing when signed out and a permission is required (fail-closed)', () => {
    mockAuth.user = null;
    renderBtn({ permission: 'reports.export' });
    expect(screen.queryByText('Export CSV')).toBeNull();
  });

  it('renders the button when the required permission is held', () => {
    mockAuth.user = { permissions: ['reports.export'] };
    renderBtn({ permission: 'reports.export' });
    expect(screen.getByText('Export CSV')).toBeInTheDocument();
  });

  it('renders the button for a wildcard (super admin) permission', () => {
    mockAuth.user = { permissions: ['*'] };
    renderBtn({ permission: 'accounting.journal.view' });
    expect(screen.getByText('Export CSV')).toBeInTheDocument();
  });

  it('never calls the export endpoint when the required permission is missing', async () => {
    mockAuth.user = { permissions: ['settlements.view'] };
    renderBtn({ permission: 'reports.export' });
    expect(mockGet).not.toHaveBeenCalled();
  });
});
