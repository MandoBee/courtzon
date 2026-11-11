import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExportButton } from './ExportButton';

// D4 — the shared button reads permissions from the auth store (via useCan).
const mockAuth: { user: { permissions: string[] } | null } = {
  user: { permissions: [] },
};
vi.mock('../../store/auth.store', () => ({
  useAuthStore: (selector: (s: typeof mockAuth) => unknown) => selector(mockAuth),
}));

const DATA = [{ id: 1, name: 'Alpha' }];

describe('ExportButton — permission prop (D4)', () => {
  beforeEach(() => {
    mockAuth.user = { permissions: [] };
  });

  it('preserves the legacy behaviour: renders without a permission prop', () => {
    render(<ExportButton data={DATA} filename="test" />);
    expect(screen.getByText('Export ▾')).toBeInTheDocument();
  });

  it('renders when the required permission is held', () => {
    mockAuth.user = { permissions: ['reports.export'] };
    render(<ExportButton data={DATA} filename="test" permission="reports.export" />);
    expect(screen.getByText('Export ▾')).toBeInTheDocument();
  });

  it('renders nothing when the required permission is missing (fail-closed)', () => {
    mockAuth.user = { permissions: ['reports.view'] };
    render(<ExportButton data={DATA} filename="test" permission="reports.export" />);
    expect(screen.queryByText('Export ▾')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders nothing when signed out and a permission is required (fail-closed)', () => {
    mockAuth.user = null;
    render(<ExportButton data={DATA} filename="test" permission="audit.export" />);
    expect(screen.queryByText('Export ▾')).toBeNull();
  });

  it('renders for a wildcard (super admin) permission', () => {
    mockAuth.user = { permissions: ['*'] };
    render(<ExportButton data={DATA} filename="test" permission="notifications.webhooks.manage" />);
    expect(screen.getByText('Export ▾')).toBeInTheDocument();
  });
});
