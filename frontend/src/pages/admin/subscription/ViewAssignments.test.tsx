import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ViewAssignments } from './SubscriptionPage';

const mockGet = vi.fn();

vi.mock('../../../services/api', () => ({
  default: { get: (...a: any[]) => mockGet(...a), post: vi.fn() },
}));
vi.mock('../../../components/ui/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../../permissions/Can', () => ({
  Can: ({ children }: { children: any }) => <>{children}</>,
}));
vi.mock('../../../utils/currency', () => ({
  formatPrice: (n: number) => `$${Number(n).toFixed(2)}`,
}));

function row(overrides: Record<string, any>) {
  return {
    org_id: 1,
    org_name: 'OrgA',
    subscription_id: 1,
    is_active: 1,
    subscription_status: 'active',
    effective_status: 'active',
    plan_name: 'Promo Club',
    billing_cycle: 'monthly',
    price: 100,
    start_date: '2026-08-18',
    end_date: '2026-09-18',
    ...overrides,
  };
}

/** 14 rows: OrgA×12 (drives pagination), OrgB×1, OrgC×1; duplicated plans/cycles/statuses. */
const ROWS: any[] = [
  ...Array.from({ length: 12 }, (_, i) => row({
    org_id: 1,
    org_name: 'OrgA',
    subscription_id: 100 + i,
    effective_status: i === 0 ? 'expired' : 'active',
    subscription_status: i === 0 ? 'expired' : 'active',
    start_date: i === 0 ? '2026-07-17' : '2026-08-18',
    end_date: i === 0 ? '2026-08-17' : '2026-09-18',
    plan_name: i % 3 === 0 ? 'Promo Club' : 'Standard Club',
    billing_cycle: i % 2 === 0 ? 'monthly' : 'yearly',
  })),
  row({ org_id: 2, org_name: 'OrgB', subscription_id: 200, plan_name: 'Pro Club', billing_cycle: 'monthly', price: 250 }),
  row({
    org_id: 3, org_name: 'OrgC', subscription_id: 300, plan_name: 'Promo Club',
    is_active: 0, effective_status: 'pending', subscription_status: 'pending',
  }),
];

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ViewAssignments />
    </QueryClientProvider>,
  );
}

const select = (label: string) => screen.getByLabelText(`Filter by ${label}`) as HTMLSelectElement;
async function pick(label: string, value: string) {
  await userEvent.selectOptions(select(label), value);
}
const visibleRows = () => document.querySelectorAll('tbody tr');

describe('View Assignments — column filters & pagination', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue({ data: { data: ROWS } });
  });

  it('dropdowns contain UNIQUE values only plus an All option', async () => {
    renderView();
    await waitFor(() => expect(screen.getByLabelText('Filter by Plan')).toBeTruthy());

    const orgOptions = within(select('Organisation')).getAllByRole('option').map((o) => o.textContent);
    expect(orgOptions[0]).toBe('All');
    expect(orgOptions.filter((v) => v === 'OrgA')).toHaveLength(1);

    const planOptions = within(select('Plan')).getAllByRole('option').map((o) => o.textContent);
    // Promo Club appears on many rows but must be listed once.
    expect(planOptions.filter((v) => v === 'Promo Club')).toHaveLength(1);
    expect(planOptions).toEqual(expect.arrayContaining(['All', 'Promo Club', 'Pro Club']));

    const cycleOptions = within(select('Cycle')).getAllByRole('option').map((o) => o.textContent);
    expect(cycleOptions.filter((v) => v === 'monthly')).toHaveLength(1);
    expect(cycleOptions).toEqual(['All', 'monthly', 'yearly']);

    const subOptions = within(select('Subscription Status')).getAllByRole('option').map((o) => o.textContent);
    expect(subOptions).toEqual(['All', 'Active', 'Expired', 'Pending']);
  });

  it('no filter dropdowns under Price / Start Date / End Date', async () => {
    renderView();
    await waitFor(() => expect(screen.getByLabelText('Filter by Cycle')).toBeTruthy());
    expect(screen.queryByLabelText('Filter by Price')).toBeNull();
    expect(screen.queryByLabelText('Filter by Start Date')).toBeNull();
    expect(screen.queryByLabelText('Filter by End Date')).toBeNull();
  });

  it('each filter narrows the table independently', async () => {
    renderView();
    await waitFor(() => expect(screen.getByLabelText('Filter by Organisation')).toBeTruthy());

    await pick('Organisation', 'OrgB');
    expect(visibleRows()).toHaveLength(1);
    const tbody = within(document.querySelector('tbody') as HTMLElement);
    expect(tbody.getByText('OrgB')).toBeTruthy();

    await pick('Organisation', 'All');
    await pick('Subscription Status', 'Expired');
    expect(visibleRows()).toHaveLength(1);
    expect(screen.getByText('17/07/2026')).toBeTruthy(); // the old Padel-style expired period

    await pick('Subscription Status', 'Pending');
    expect(visibleRows()).toHaveLength(1);
    expect(tbody.getByText('OrgC')).toBeTruthy();

    await pick('Subscription Status', 'All');
    await pick('Plan', 'Pro Club');
    expect(visibleRows()).toHaveLength(1);

    await pick('Plan', 'All');
    await pick('Cycle', 'yearly');
    // OrgA yearly rows only (6 of them)
    expect(visibleRows()).toHaveLength(6);
  });

  it('combined filters apply cumulative AND logic', async () => {
    renderView();
    await waitFor(() => expect(screen.getByLabelText('Filter by Organisation')).toBeTruthy());

    await pick('Organisation', 'OrgA');
    await pick('Subscription Status', 'Expired');
    expect(visibleRows()).toHaveLength(1); // OrgA's single expired period

    await pick('Cycle', 'yearly');
    // OrgA + Expired + yearly matches nothing
    expect(visibleRows()).toHaveLength(0);
    expect(screen.getByText('No subscriptions match the selected filters.')).toBeTruthy();
  });

  it('paginates at 10 rows per page and navigates both directions', async () => {
    renderView();
    await waitFor(() => expect(screen.getByLabelText('Next page')).toBeTruthy());

    expect(visibleRows()).toHaveLength(10);
    expect(screen.getByText(/Showing 1–10 of 14/)).toBeTruthy();

    await userEvent.click(screen.getByLabelText('Next page'));
    expect(visibleRows()).toHaveLength(4);
    expect(screen.getByText(/Showing 11–14 of 14/)).toBeTruthy();
    expect(screen.getByText(/Page 2 \/ 2/)).toBeTruthy();
    expect(screen.getByLabelText('Next page')).toHaveProperty('disabled', true);

    await userEvent.click(screen.getByLabelText('Previous page'));
    expect(visibleRows()).toHaveLength(10);
    expect(screen.getByText(/Page 1 \/ 2/)).toBeTruthy();
  });

  it('resets to page 1 whenever any filter changes', async () => {
    renderView();
    await waitFor(() => expect(screen.getByLabelText('Next page')).toBeTruthy());
    await userEvent.click(screen.getByLabelText('Next page'));
    expect(screen.getByText(/Page 2 \/ 2/)).toBeTruthy();

    // A filter yielding >10 rows keeps the footer visible — page must be back at 1.
    await pick('Organisation', 'OrgA');
    expect(screen.getByText(/Showing 1–10 of 12/)).toBeTruthy();
    expect(screen.getByText(/Page 1 \/ 2/)).toBeTruthy();

    await userEvent.click(screen.getByLabelText('Next page'));
    expect(screen.getByText(/Page 2 \/ 2/)).toBeTruthy();
    await pick('Organisation Status', 'Active'); // cumulative with Organisation=OrgA → 12 rows → footer stays
    expect(screen.getByText(/Showing 1–10 of 12/)).toBeTruthy();
    expect(screen.getByText(/Page 1 \/ 2/)).toBeTruthy();
  });
});

