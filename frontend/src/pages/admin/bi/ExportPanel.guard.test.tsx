import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * D4 Expanded — C3: ExportPanel must refuse to call the export endpoint from its
 * handler when bi.export is missing, even if the surrounding <Can> gate is
 * bypassed/misused.
 *
 * `Can` is intentionally mocked to always render its children so the handler
 * guard is exercised in isolation.
 */

const mockGet = vi.fn();

vi.mock('../../../services/api', () => ({
  default: { get: (...args: any[]) => mockGet(...args) },
}));
vi.mock('../../../permissions/Can', () => ({
  Can: ({ children }: { children: any }) => <>{children}</>,
}));

const mockAuth: { user: { permissions: string[] } | null } = {
  user: { permissions: [] },
};
vi.mock('../../../store/auth.store', () => ({
  useAuthStore: (selector: (s: typeof mockAuth) => unknown) => selector(mockAuth),
}));

import { ExportPanel } from './ExportPanel';

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: new Blob(['id']) });
  mockAuth.user = { permissions: [] };
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:test'), writable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true });
});

describe('D4 Expanded — ExportPanel internal handler guard', () => {
  it('does not call the export endpoint without bi.export', () => {
    mockAuth.user = { permissions: ['bi.dashboard.view'] };
    render(<ExportPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('does not call the export endpoint when signed out', () => {
    mockAuth.user = null;
    render(<ExportPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('calls the export endpoint when bi.export is held', async () => {
    mockAuth.user = { permissions: ['bi.export'] };
    render(<ExportPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
    expect(String(mockGet.mock.calls[0][0])).toContain('/bi/export/revenue');
  });
});
