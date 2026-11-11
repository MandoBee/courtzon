import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// D4 — the BI export panel is gated by bi.export (never by bi.dashboard.view).
const mockAuth: { user: { permissions: string[] } | null } = {
  user: { permissions: [] },
};
vi.mock('../../../store/auth.store', () => ({
  useAuthStore: (selector: (s: typeof mockAuth) => unknown) => selector(mockAuth),
}));

import { ExportPanel } from './ExportPanel';

describe('D4 — BI ExportPanel permission', () => {
  beforeEach(() => {
    mockAuth.user = { permissions: [] };
  });

  it('is hidden when the user has bi.dashboard.view only', () => {
    mockAuth.user = { permissions: ['bi.dashboard.view'] };
    render(<ExportPanel />);
    expect(screen.queryByText('Export Report')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull();
  });

  it('is hidden when signed out', () => {
    mockAuth.user = null;
    render(<ExportPanel />);
    expect(screen.queryByText('Export Report')).toBeNull();
  });

  it('is visible when the user holds bi.export', () => {
    mockAuth.user = { permissions: ['bi.export'] };
    render(<ExportPanel />);
    expect(screen.getByText('Export Report')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument();
  });

  it('is visible for the wildcard (super admin) permission', () => {
    mockAuth.user = { permissions: ['*'] };
    render(<ExportPanel />);
    expect(screen.getByText('Export Report')).toBeInTheDocument();
  });
});
