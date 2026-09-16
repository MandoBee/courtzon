import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BookingModal from './BookingModal';
import { ToastProvider } from '../ui/Toast';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth.store';
import { toUtcIsoForApi } from '../../utils/formatDate';

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

vi.mock('../../realtime/useResourceRoom', () => ({
  useResourceRoom: () => {},
}));

vi.mock('../../hooks/usePaymentConfirm', () => ({
  usePaymentConfirm: () => ({ state: 'idle', confirm: vi.fn(), reset: vi.fn() }),
}));

vi.mock('../payment/PaymobPixelCard', () => ({ default: () => null }));
vi.mock('../payment/PaymentStatusPoller', () => ({ default: () => null }));

vi.mock('../../i18n', () => ({
  useTranslation: () => ({
    t: (key: string, defOrParams?: string | Record<string, string | number>, params?: Record<string, string | number>) => {
      if (typeof defOrParams === 'string') return defOrParams;
      const defaults: Record<string, string> = {
        'booking.deadline_label': 'Application Deadline',
        'booking.deadline_hint': 'Must be before {time}',
        'booking.deadline_invalid': 'Deadline must be before the booking start time',
        'common.confirm': 'common.confirm',
        'booking.confirm_pay': 'booking.confirm_pay',
        'common.next': 'common.next',
        'common.cancel': 'common.cancel',
        'common.back': 'common.back',
        'booking.special_requests': 'booking.special_requests',
        'booking.loading_slots': 'booking.loading_slots',
      };
      let out = defaults[key] ?? key;
      const p = defOrParams && typeof defOrParams === 'object' ? defOrParams : params;
      if (p) {
        Object.entries(p).forEach(([k, v]) => {
          out = out.replace(`{${k}}`, String(v));
        });
      }
      return out;
    },
  }),
}));

function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const BRANCH = {
  id: 1, name: 'Branch A', city: 'Cairo', timezone: 'Africa/Cairo',
  access_type: 'open', is_active: true,
};
const RESOURCE = {
  id: 1, name: 'Court 1', sport_id: 1, is_active: true, resource_type_name: 'Court',
  slot_duration: 60, hourly_price: 100, opening_time: '08:00', closing_time: '22:00',
};
const SLOT = { slot_start: '10:00', slot_end: '11:00', status: 'available' };

vi.mocked(api.get).mockImplementation((url: string) => {
  if (url === '/sports') return Promise.resolve({ data: [{ id: 1, name: 'Tennis', icon: '🎾' }] });
  if (url.startsWith('/branches?sportId=')) return Promise.resolve({ data: { data: [BRANCH] } });
  if (url === '/branches/1') return Promise.resolve({ data: BRANCH });
  if (url === '/branches/1/my-access') return Promise.resolve({ data: { status: 'approved' } });
  if (url === '/branches/1/resources') return Promise.resolve({ data: { data: [RESOURCE] } });
  if (url.includes('/slots?date=')) return Promise.resolve({ data: { data: [SLOT] } });
  return Promise.resolve({ data: {} });
});

const preparedPayload: any[] = [];
vi.mocked(api.post).mockImplementation((url: string, body?: any) => {
  if (url === '/bookings/prepare') {
    preparedPayload.push(body);
    return Promise.resolve({ data: { prepareId: 'p-test', clientSecret: null, paymentId: null } });
  }
  return Promise.resolve({ data: { id: 99 } });
});

vi.mocked(api.delete).mockResolvedValue({ data: {} } as any);

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <BookingModal open onClose={() => {}} />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

async function driveToCriteria() {
  await screen.findByText('Tennis');
  fireEvent.click(screen.getByText('Tennis'));
  await screen.findByText('Branch A');
  fireEvent.click(screen.getByText('Branch A'));
  await screen.findByText('Court 1');
  fireEvent.click(screen.getByText('Court 1'));
  await screen.findByText('10:00');
  fireEvent.click(screen.getByText('10:00'));
  fireEvent.click(screen.getByText('common.confirm'));
  await screen.findByText('Find Players');
  fireEvent.click(screen.getByText('Find Players'));
  await screen.findByText(/Looking for Players/);
}

function deadlineInput(): HTMLInputElement {
  const el = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
  if (!el) throw new Error('datetime-local input not found');
  return el;
}

describe('BookingModal — matchmaking application deadline', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockClear();
    vi.mocked(api.post).mockClear();
    vi.mocked(api.delete).mockClear();
    preparedPayload.length = 0;
    (api.get as any).mockImplementation(vi.mocked(api.get).getMockImplementation()!);
    (api.post as any).mockImplementation(vi.mocked(api.post).getMockImplementation()!);
    useAuthStore.setState({ user: { id: 7, mainSportId: null } as any, isAuthenticated: true });
  });

  it('Create Match form opens with the Application Deadline EMPTY (no auto-generated value)', async () => {
    renderModal();
    await driveToCriteria();
    expect(deadlineInput().value).toBe('');
    // The hint explains the constraint but the field itself is empty.
    expect(screen.getByText(/Must be before/)).toBeTruthy();
  });

  it('submits with deadline undefined when the user leaves the field empty', async () => {
    renderModal();
    await driveToCriteria();
    fireEvent.click(screen.getByText('booking.confirm_pay'));
    await waitFor(() => expect(preparedPayload.length).toBe(1));
    const mm = preparedPayload[0].matchmaking;
    expect(mm.deadline).toBeUndefined();
  });

  it('accepts an explicitly selected deadline strictly before the match start (branch timezone → UTC)', async () => {
    renderModal();
    await driveToCriteria();
    const today = localToday();
    fireEvent.change(deadlineInput(), { target: { value: `${today}T09:00` } });
    // No red validation error is shown for a valid deadline.
    expect(screen.queryByText(/Deadline must be before/)).toBeNull();
    fireEvent.click(screen.getByText('booking.confirm_pay'));
    await waitFor(() => expect(preparedPayload.length).toBe(1));
    expect(preparedPayload[0].matchmaking.deadline)
      .toBe(toUtcIsoForApi(`${today}T09:00`, 'Africa/Cairo'));
  });

  it('blocks a deadline exactly equal to the match start (strictly-before rule)', async () => {
    renderModal();
    await driveToCriteria();
    const today = localToday();
    fireEvent.change(deadlineInput(), { target: { value: `${today}T10:00` } });
    expect(screen.getByText(/Deadline must be before/)).toBeTruthy();
    // The submit button is disabled while the deadline is invalid.
    expect((screen.getByText('booking.confirm_pay') as HTMLButtonElement).disabled).toBe(true);
  });

  it('blocks a deadline after the match start', async () => {
    renderModal();
    await driveToCriteria();
    const today = localToday();
    fireEvent.change(deadlineInput(), { target: { value: `${today}T11:00` } });
    expect(screen.getByText(/Deadline must be before/)).toBeTruthy();
    expect((screen.getByText('booking.confirm_pay') as HTMLButtonElement).disabled).toBe(true);
  });

  it('interacting with the deadline field does not trigger an API request storm', async () => {
    renderModal();
    await driveToCriteria();
    const getsBefore = vi.mocked(api.get).mock.calls.length;
    const postsBefore = vi.mocked(api.post).mock.calls.length;
    const today = localToday();
    fireEvent.change(deadlineInput(), { target: { value: `${today}T09:00` } });
    fireEvent.change(deadlineInput(), { target: { value: `${today}T09:30` } });
    fireEvent.change(deadlineInput(), { target: { value: '' } });
    // No network activity is triggered by deadline editing.
    expect(vi.mocked(api.get).mock.calls.length).toBe(getsBefore);
    expect(vi.mocked(api.post).mock.calls.length).toBe(postsBefore);
  });
});