import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ActionCenter, QuickActions } from './ActionCenter';

function renderWith(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('dashboard action components — explicit authorization required', () => {
  const actions = [
    { label: 'Allowed', icon: '✅', path: '/admin/users', permission: 'users.view' },
    { label: 'Denied by route', icon: '🚫', path: '/admin/secret' },
    { label: 'Denied by permission', icon: '🔒', path: '/admin/audit-logs', permission: 'sidebar.audit' },
  ];

  it('omits actions whose destination or action key is not authorized', () => {
    renderWith(
      <ActionCenter
        canAccess={(path) => path !== '/admin/secret'}
        can={(p) => p === 'users.view'}
        actions={actions}
      />,
    );

    expect(screen.getByText('Allowed')).toBeTruthy();
    expect(screen.queryByText('Denied by route')).toBeNull();
    expect(screen.queryByText('Denied by permission')).toBeNull();
  });

  it('applies the same protection to QuickActions', () => {
    renderWith(
      <QuickActions
        canAccess={(path) => path !== '/admin/secret'}
        can={(p) => p === 'users.view'}
        actions={actions}
      />,
    );

    expect(screen.getByText('Allowed')).toBeTruthy();
    expect(screen.queryByText('Denied by route')).toBeNull();
    expect(screen.queryByText('Denied by permission')).toBeNull();
  });
});
