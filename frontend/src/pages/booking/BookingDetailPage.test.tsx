import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../utils/currency', () => ({
  formatPrice: (n: number, _c?: string) => `${n.toFixed(2)}`,
}));

vi.mock('../../utils/formatDate', () => ({
  formatISODate: (d: string) => d,
}));

vi.mock('../../components/booking/ManageApplicantsPopup', () => ({
  default: () => null,
}));

vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

import api from '../../services/api';
import BookingDetailPage from './BookingDetailPage';

const mockGet = vi.mocked(api.get);

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/bookings/1']}>
        <Routes>
          <Route path="/bookings/:id" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function makeBooking(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    public_id: 'booking-pub-0001',
    user_id: 100,
    organisation_name: 'Padel Edge',
    resource_name: 'Court 1',
    branch_name: 'Branch A',
    booking_type: 'private_match',
    booking_status: 'confirmed',
    booking_date: '2026-09-01',
    start_time: '10:00:00',
    end_time: '11:00:00',
    total_amount: 250.00,
    payment_method: 'card',
    payment_status: 'paid',
    refunded_amount: 0,
    tax_amount: 0,
    tax_rate: 0,
    commission_rate: 10,
    commission_amount: 25.00,
    net_amount: 225.00,
    club_amount: 225.00,
    ...overrides,
  };
}

describe('BookingDetailPage — Payment & Financial Details', () => {
  it('displays booking total amount from API', async () => {
    mockGet.mockResolvedValue({ data: makeBooking({ total_amount: 350.50, payment_method: 'card', payment_status: 'paid' }) });
    wrap(<BookingDetailPage />);
    expect(await screen.findByText('350.50')).toBeTruthy();
    expect(screen.getByText('booking.total_amount')).toBeTruthy();
  });

  it('displays payment method label for card', async () => {
    mockGet.mockResolvedValue({ data: makeBooking({ payment_method: 'card' }) });
    wrap(<BookingDetailPage />);
    await screen.findByText('250.00');
    expect(screen.getByText('Credit/Debit Card')).toBeTruthy();
  });

  it('displays payment method label for wallet', async () => {
    mockGet.mockResolvedValue({ data: makeBooking({ payment_method: 'wallet', total_amount: 100 }) });
    wrap(<BookingDetailPage />);
    await screen.findByText('100.00');
    expect(screen.getByText('Wallet')).toBeTruthy();
  });

  it('displays payment method label for cash', async () => {
    mockGet.mockResolvedValue({ data: makeBooking({ payment_method: 'cash', total_amount: 50 }) });
    wrap(<BookingDetailPage />);
    await screen.findByText('50.00');
    expect(screen.getByText('Cash')).toBeTruthy();
  });

  it('displays payment status as a badge', async () => {
    mockGet.mockResolvedValue({ data: makeBooking({ payment_status: 'paid' }) });
    wrap(<BookingDetailPage />);
    expect(await screen.findByText('paid')).toBeTruthy();
    expect(screen.getByText('booking.payment_status')).toBeTruthy();
  });

  it('displays refunded amount when booking is refunded', async () => {
    mockGet.mockResolvedValue({
      data: makeBooking({
        payment_status: 'refunded',
        refunded_amount: 200.00,
        total_amount: 250.00,
      }),
    });
    wrap(<BookingDetailPage />);
    await screen.findByText('200.00');
    expect(screen.getByText('booking.refunded_amount')).toBeTruthy();
  });

  it('does NOT show refund section when refunded_amount is 0', async () => {
    mockGet.mockResolvedValue({
      data: makeBooking({
        payment_status: 'paid',
        refunded_amount: 0,
      }),
    });
    wrap(<BookingDetailPage />);
    await screen.findByText('250.00');
    expect(screen.queryByText('booking.refunded_amount')).toBeNull();
  });

  it('does NOT show refund section when refunded_amount is missing', async () => {
    mockGet.mockResolvedValue({
      data: makeBooking({
        payment_status: 'paid',
        refunded_amount: undefined,
      }),
    });
    wrap(<BookingDetailPage />);
    await screen.findByText('250.00');
    expect(screen.queryByText('booking.refunded_amount')).toBeNull();
  });

  it('shows the financial details section header', async () => {
    mockGet.mockResolvedValue({ data: makeBooking() });
    wrap(<BookingDetailPage />);
    expect(await screen.findByText('booking.financial_details')).toBeTruthy();
  });

  it('CARD booking shows all financial fields', async () => {
    mockGet.mockResolvedValue({
      data: makeBooking({
        total_amount: 500.00,
        payment_method: 'card',
        payment_status: 'paid',
        refunded_amount: 0,
      }),
    });
    wrap(<BookingDetailPage />);
    await screen.findByText('500.00');
    expect(screen.getByText('Credit/Debit Card')).toBeTruthy();
    expect(screen.getByText('paid')).toBeTruthy();
    expect(screen.queryByText('booking.refunded_amount')).toBeNull();
  });

  it('CASH/COD booking shows correct payment method', async () => {
    mockGet.mockResolvedValue({
      data: makeBooking({
        total_amount: 150.00,
        payment_method: 'cod',
        payment_status: 'pending',
      }),
    });
    wrap(<BookingDetailPage />);
    await screen.findByText('150.00');
    expect(screen.getByText('Cash on Delivery')).toBeTruthy();
  });

  it('Wallet booking shows correct payment method', async () => {
    mockGet.mockResolvedValue({
      data: makeBooking({
        total_amount: 75.00,
        payment_method: 'wallet',
        payment_status: 'paid',
      }),
    });
    wrap(<BookingDetailPage />);
    await screen.findByText('75.00');
    expect(screen.getByText('Wallet')).toBeTruthy();
  });

  it('partially refunded booking shows refund amount', async () => {
    mockGet.mockResolvedValue({
      data: makeBooking({
        payment_status: 'partially_refunded',
        total_amount: 300.00,
        refunded_amount: 100.00,
      }),
    });
    wrap(<BookingDetailPage />);
    await screen.findByText('300.00');
    expect(screen.getByText('100.00')).toBeTruthy();
    expect(screen.getByText('booking.refunded_amount')).toBeTruthy();
  });

  it('existing booking information remains unchanged', async () => {
    mockGet.mockResolvedValue({
      data: makeBooking({
        resource_name: 'Court 5',
        booking_type: 'private_match',
        branch_name: 'Main Branch',
        booking_date: '2026-09-15',
        start_time: '14:00:00',
        end_time: '15:30:00',
        total_amount: 200.00,
        payment_method: 'wallet',
        payment_status: 'paid',
      }),
    });
    wrap(<BookingDetailPage />);
    await screen.findByText('Court 5');
    expect(screen.getByText('private match')).toBeTruthy();
    expect(screen.getByText('Main Branch')).toBeTruthy();
    expect(screen.getByText('200.00')).toBeTruthy();
    expect(screen.getByText('Wallet')).toBeTruthy();
  });
});
