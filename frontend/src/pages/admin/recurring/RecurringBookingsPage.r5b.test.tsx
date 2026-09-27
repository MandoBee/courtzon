import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─────────────────────────────────────────────────────────────────────────────
// R5-B — scenarios 36-39: the CARD payment step for a recurring series.
//
// The contract being tested:
//   36  the step renders the PLAYER, the occurrence count, the AUTHORITATIVE
//       series total and Card as the method, and POSTs only the return URL —
//       never an amount, a player, a currency or a reference.
//   37  a payment URL sends the operator to the canonical hosted checkout; a
//       pending/paid replay creates NO second payment and says so.
//   38  on return the BACKEND decides: a paid row toasts success and the return
//       marker is replaced out of the URL; a still-pending or failed row never
//       claims success.
//   39  every amount and the collect button are permission-gated.
// ─────────────────────────────────────────────────────────────────────────────

const mockGet = vi.fn();
const mockPost = vi.fn();
const navigateMock = vi.fn();
const searchParamsMock = vi.fn();
const showToastMock = vi.fn();
const canMock = vi.fn();

vi.mock('../../../services/api', () => ({
  default: { get: (...a: any[]) => mockGet(...a), post: (...a: any[]) => mockPost(...a) },
}));
vi.mock('../../../components/ui/Toast', () => ({
  useToast: () => ({ showToast: showToastMock }),
}));
vi.mock('../../../hooks/useCan', () => ({
  useCan: () => ({ can: canMock }),
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  Link: ({ to, children }: any) => <a href={to}>{children}</a>,
  useSearchParams: () => [new URLSearchParams(searchParamsMock())],
}));
// Real `Can` — the gating itself is part of what is under test.
vi.mock('../../../store/auth.store', () => ({
  useAuthStore: (sel: any) => sel({ user: { permissions: grantedPermissions } }),
}));

import RecurringBookingsPage from './RecurringBookingsPage';

let grantedPermissions: string[] = [];
/** Capture the `window.location.href` assignment the hosted checkout performs. */
let redirectedTo: string | null = null;

const ALL_SERIES_PERMS = [
  'org.bookings.manage',
  'bookings.recurring.collect-payment',
  'bookings.recurring.payment-status',
  'bookings.recurring.series-total',
];

/** A series detail exactly as `GET /admin/recurring/:id` returns it. */
function seriesDetail(overrides: Record<string, any> = {}) {
  return {
    seriesId: 7,
    playerUserId: 4242,
    occurrenceCount: 2,
    // R5-C1 — authoritative series economics (subtotal/tax/gross from backend).
    seriesTotal: 2800,     // == seriesSubtotal: pre-tax, retained for backward compat
    seriesSubtotal: 2800,
    seriesTax: 352.8,
    seriesGross: 3152.8,
    status: 'active',
    timezone: 'Africa/Cairo',
    startDate: '2026-09-14',
    endDate: '2026-09-17',
    startTime: '18:00',
    endTime: '20:00',
    occurrences: [
      { bookingId: 1, date: '2026-09-14', startTime: '18:00', endTime: '20:00', status: 'pending', totalAmount: 1600 },
      { bookingId: 2, date: '2026-09-17', startTime: '18:00', endTime: '20:00', status: 'pending', totalAmount: 1200 },
    ],
    payment: {
      paymentId: null, status: null, amount: 0, currency: 'EGP',
      paymentMethod: null, gatewayProvider: null, gatewayReference: null, paidAt: null, createdAt: null,
    },
    ...overrides,
  };
}

function wireApi(detail: any, payResponse?: any) {
  mockGet.mockImplementation((url: string) => {
    if (url === '/admin/recurring') return Promise.resolve({ data: { data: [{ seriesId: 7, status: 'active', weekdays: [1, 4], startDate: '2026-09-14', endDate: '2026-09-17', startTime: '18:00', endTime: '20:00', createdBy: 1 }] } });
    if (url === '/admin/recurring/7') return Promise.resolve({ data: detail });
    if (url.startsWith('/branches')) return Promise.resolve({ data: { data: [] } });
    return Promise.resolve({ data: { data: [] } });
  });
  mockPost.mockImplementation((url: string) => {
    if (url === '/admin/recurring/7/pay') return Promise.resolve({ data: payResponse });
    return Promise.resolve({ data: {} });
  });
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RecurringBookingsPage />
    </QueryClientProvider>,
  );
}

const originalLocation = window.location;
beforeEach(() => {
  vi.clearAllMocks();
  grantedPermissions = [...ALL_SERIES_PERMS];
  canMock.mockReturnValue(true);
  redirectedTo = null;
  // `created=7` is the real post-create URL, and it is what auto-selects the
  // series so the payment step is on screen without a manual click.
  searchParamsMock.mockReturnValue('created=7');
  // jsdom refuses a real navigation, so intercept the assignment.
  delete (window as any).location;
  (window as any).location = { ...originalLocation, get href() { return originalLocation.href; }, set href(v: string) { redirectedTo = v; } };
  (window as any).confirm = () => true;
});

afterEach(() => {
  (window as any).location = originalLocation;
});

describe('R5-B — 36: the CARD payment step shows the authoritative facts and sends no money', () => {
  it('renders player, occurrence count, authoritative Subtotal/Tax/Total, Card and the collect action', async () => {
    wireApi(seriesDetail());
    renderPage();

    await waitFor(() => expect(screen.getByText(/Series payment — one card payment/i)).toBeTruthy());
    expect(screen.getByText('#4242')).toBeTruthy();                 // the player, not the operator
    // `selector: 'dd'` keeps this off the weekday/status columns of the tables.
    expect(screen.getByText('2', { selector: 'dd' })).toBeTruthy();  // occurrence count
    // R5-C1 — all three monetary lines come from the backend verbatim.
    expect(screen.getByText(/Subtotal \(authoritative\)/)).toBeTruthy();
    expect(screen.getByText(/Tax \(authoritative\)/)).toBeTruthy();
    expect(screen.getByText(/Total to pay \(authoritative\)/)).toBeTruthy();
    expect(screen.getByText(/2,800/)).toBeTruthy();                  // subtotal (LE 2,800.00)
    expect(screen.getByText(/352.80/)).toBeTruthy();                 // tax
    expect(screen.getByText(/3,152.80/)).toBeTruthy();               // total to pay == the charged gross
    expect(screen.getByText('Card', { selector: 'strong' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Collect card payment/i })).toBeTruthy();
  });

  it('POSTs ONLY the return URL — never an amount, player, currency or reference', async () => {
    wireApi(seriesDetail());
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: /Collect card payment/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Collect card payment/i }));

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe('/admin/recurring/7/pay');
    // The browser's only contribution is where to come back to.
    expect(Object.keys(body)).toEqual(['returnUrl']);
    expect(String(body.returnUrl)).toContain('/admin/recurring?created=7');
    expect(String(body.returnUrl)).toContain('payment=return');
    for (const forbidden of ['amount', 'total', 'seriesTotal', 'playerUserId', 'currency', 'paymentMethod', 'referenceId', 'referenceType', 'idempotencyKey']) {
      expect(body).not.toHaveProperty(forbidden);
    }
  });

  it('never lets the browser compute totals — subtotal/tax/total render the backend values verbatim', async () => {
    // The backend gross is deliberately INCONSISTENT with subtotal+tax; the panel
    // must still show each backend figure verbatim rather than summing anything.
    const detail = seriesDetail({ seriesTotal: 9999, seriesSubtotal: 9999, seriesTax: 1, seriesGross: 4444 });
    wireApi(detail);
    renderPage();
    await waitFor(() => expect(screen.getByText(/9,999/)).toBeTruthy());   // subtotal from backend
    expect(screen.getByText(/1\.00/)).toBeTruthy();                        // tax from backend
    expect(screen.getByText(/4,444/)).toBeTruthy();                        // total from backend
    expect(screen.queryByText(/3,152\.80/)).toBeNull();                    // never a client-side sum
    expect(screen.queryByText(/10,000/)).toBeNull();                       // subtotal+tax never added by React
  });
});

describe('R5-B — 37: card action → canonical checkout, and a replay never pays twice', () => {
  it('sends the operator to the canonical hosted checkout when a payment URL comes back', async () => {
    wireApi(seriesDetail(), { paymentId: 55, paymentUrl: 'https://accept.paymob.com/checkout/abc', alreadyCharged: false });
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /Collect card payment/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Collect card payment/i }));

    await waitFor(() => expect(redirectedTo).toBe('https://accept.paymob.com/checkout/abc'));
  });

  it('a pending replay (no new gateway call, no URL) says so and never reports success', async () => {
    wireApi(
      seriesDetail({
        payment: { paymentId: 55, status: 'pending', amount: 2800, currency: 'EGP', paymentMethod: 'card', gatewayProvider: 'mock', gatewayReference: 'mock_1', paidAt: null, createdAt: '2026-09-01T00:00:00Z' },
      }),
      { paymentId: 55, paymentUrl: null, alreadyCharged: true, status: 'pending' },
    );
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: /Re-check payment status/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Re-check payment status/i }));

    await waitFor(() =>
      expect(showToastMock).toHaveBeenCalledWith(expect.stringContaining('no second payment was created'), expect.anything()),
    );
    // No false success and no redirect.
    expect(redirectedTo).toBeNull();
    expect(showToastMock).not.toHaveBeenCalledWith(expect.stringContaining('Payment received'), expect.anything());
  });

  it('a settled replay reports "already paid" and still creates no second payment', async () => {
    wireApi(
      seriesDetail({
        payment: { paymentId: 55, status: 'paid', amount: 2800, currency: 'EGP', paymentMethod: 'card', gatewayProvider: 'mock', gatewayReference: 'mock_1', paidAt: '2026-09-01T10:00:00Z', createdAt: '2026-09-01T00:00:00Z' },
      }),
      { paymentId: 55, paymentUrl: null, alreadyCharged: true, status: 'paid' },
    );
    renderPage();

    // A paid series offers no collect button at all.
    await waitFor(() => expect(screen.getByText('PAID')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Collect card payment/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Re-check payment status/i })).toBeNull();
  });

  it('a terminal failure is explained and offers no re-charge (one payment per series)', async () => {
    wireApi(
      seriesDetail({
        payment: { paymentId: 55, status: 'failed', amount: 2800, currency: 'EGP', paymentMethod: 'card', gatewayProvider: 'mock', gatewayReference: 'mock_1', paidAt: null, createdAt: '2026-09-01T00:00:00Z' },
      }),
    );
    renderPage();
    await waitFor(() => expect(screen.getByText('FAILED')).toBeTruthy());
    expect(screen.getByText(/cannot be re-charged here/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Collect card payment/i })).toBeNull();
  });
});

describe('R5-B — 38: on return the backend is authoritative, never the URL', () => {
  it('a PAID backend read toasts success and replaces the return marker out of the URL', async () => {
    searchParamsMock.mockReturnValue('created=7&payment=return');
    wireApi(
      seriesDetail({
        payment: { paymentId: 55, status: 'paid', amount: 2800, currency: 'EGP', paymentMethod: 'card', gatewayProvider: 'mock', gatewayReference: 'mock_1', paidAt: '2026-09-01T10:00:00Z', createdAt: '2026-09-01T00:00:00Z' },
      }),
    );
    renderPage();

    await waitFor(() => expect(showToastMock).toHaveBeenCalledWith(expect.stringContaining('Payment received'), 'success'));
    // The marker is stripped with replace:true so Back never replays the toast.
    expect(navigateMock).toHaveBeenCalledWith('/admin/recurring?created=7', { replace: true });
  });

  it('a return marker with a PENDING backend read never claims success', async () => {
    searchParamsMock.mockReturnValue('created=7&payment=return');
    wireApi(
      seriesDetail({
        payment: { paymentId: 55, status: 'processing', amount: 2800, currency: 'EGP', paymentMethod: 'card', gatewayProvider: 'mock', gatewayReference: 'mock_1', paidAt: null, createdAt: '2026-09-01T00:00:00Z' },
      }),
    );
    renderPage();

    await waitFor(() => expect(showToastMock).toHaveBeenCalledWith(expect.stringContaining('still processing'), 'info'));
    expect(showToastMock).not.toHaveBeenCalledWith(expect.stringContaining('Payment received'), expect.anything());
    expect(navigateMock).toHaveBeenCalledWith('/admin/recurring?created=7', { replace: true });
  });

  it('a return marker with a FAILED backend read warns and never claims success', async () => {
    searchParamsMock.mockReturnValue('created=7&payment=return');
    wireApi(
      seriesDetail({
        payment: { paymentId: 55, status: 'expired', amount: 2800, currency: 'EGP', paymentMethod: 'card', gatewayProvider: 'mock', gatewayReference: 'mock_1', paidAt: null, createdAt: '2026-09-01T00:00:00Z' },
      }),
    );
    renderPage();

    await waitFor(() => expect(showToastMock).toHaveBeenCalledWith(expect.stringContaining('did not complete'), 'warning'));
    expect(showToastMock).not.toHaveBeenCalledWith(expect.stringContaining('Payment received'), expect.anything());
  });

  it('without the marker there is no return toast and no history rewrite', async () => {
    searchParamsMock.mockReturnValue('created=7');
    wireApi(seriesDetail());
    renderPage();
    await waitFor(() => expect(screen.getByText(/Series payment — one card payment/i)).toBeTruthy());
    expect(showToastMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});

describe('R5-B — 39: the payment step is permission-gated element by element', () => {
  it('hides the collect button without bookings.recurring.collect-payment', async () => {
    grantedPermissions = ALL_SERIES_PERMS.filter((p) => p !== 'bookings.recurring.collect-payment');
    wireApi(seriesDetail());
    renderPage();
    await waitFor(() => expect(screen.getByText(/Series payment — one card payment/i)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Collect card payment/i })).toBeNull();
  });

  it('hides the status chip without bookings.recurring.payment-status', async () => {
    grantedPermissions = ALL_SERIES_PERMS.filter((p) => p !== 'bookings.recurring.payment-status');
    wireApi(seriesDetail());
    renderPage();
    await waitFor(() => expect(screen.getByText(/Series payment — one card payment/i)).toBeTruthy());
    expect(screen.queryByText('NOT STARTED')).toBeNull();
  });

  it('hides ALL money values (subtotal/tax/total) without bookings.recurring.series-total', async () => {
    grantedPermissions = ALL_SERIES_PERMS.filter((p) => p !== 'bookings.recurring.series-total');
    wireApi(seriesDetail());
    renderPage();
    await waitFor(() => expect(screen.getByText(/Series payment — one card payment/i)).toBeTruthy());
    // The whole money block is permission-gated (its labels come only with the value).
    expect(screen.queryByText(/Subtotal \(authoritative\)/)).toBeNull();
    expect(screen.queryByText(/2,800/)).toBeNull();
    expect(screen.queryByText(/352\.80/)).toBeNull();
    expect(screen.queryByText(/3,152\.80/)).toBeNull();
  });

  it('an unauthorised operator sees the whole page blocked, not a half-open payment step', async () => {
    canMock.mockReturnValue(false);
    wireApi(seriesDetail());
    renderPage();
    await waitFor(() => expect(screen.getByText(/not authorized to manage recurring reservations/i)).toBeTruthy());
    expect(screen.queryByText(/Series payment — one card payment/i)).toBeNull();
  });
});

describe('R5-C4 — 40: the series CASH confirmation step', () => {
  const CASH_PERMS = ['org.bookings.manage', 'bookings.recurring.collect-payment', 'bookings.recurring.collect-cash', 'bookings.recurring.series-total'];

  it('renders the authoritative cash values and confirms with an EMPTY body (no amount)', async () => {
    grantedPermissions = [...CASH_PERMS];
    wireApi(seriesDetail());
    renderPage();

    await waitFor(() => expect(screen.getByText(/Series cash — one operator confirmation/i)).toBeTruthy());
    expect(screen.getByText(/Total cash received \(authoritative\)/)).toBeTruthy();
    // Money values are backend-provided; they may also appear in the card step,
    // so assert presence (>=1) rather than uniqueness.
    expect(screen.getAllByText(/3,152\.80/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/2,800/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/352\.80/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /Confirm cash received/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Confirm cash received/i }));
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    const call = mockPost.mock.calls.find((c: any) => String(c[0]).includes('/cash-confirm')) || [];
    expect(call[0]).toBe('/admin/recurring/7/cash-confirm');
    // The body is strictly empty — the client can never send a money amount.
    expect(call[1]).toEqual({});
  });

  it('hides the cash step without bookings.recurring.collect-cash', async () => {
    grantedPermissions = ['org.bookings.manage'];
    wireApi(seriesDetail());
    renderPage();
    await waitFor(() => expect(screen.getByText(/Series payment — one card payment/i)).toBeTruthy());
    expect(screen.queryByText(/Series cash — one operator confirmation/i)).toBeNull();
  });
});
