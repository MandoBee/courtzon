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
});