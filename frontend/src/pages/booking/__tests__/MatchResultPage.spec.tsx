import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MatchResultPage from '../MatchResultPage';
import api from '../../../services/api';
import * as mrApi from '../../../services/match-result.api';
import { ToastProvider } from '../../../components/ui/Toast';

const __state = vi.hoisted(() => ({
  match: {
    id: 42,
    sport_id: 22,
    sport_name: 'Padel',
    status: 'completed',
    booking_date: '2026-03-01',
    played_at: '2026-03-01 10:00:00',
    participants_json: JSON.stringify([{ userId: 1, role: 'host', fullName: 'Me' }]),
    is_participant: true,
  } as any,
  record: null as any,
  formats: [{ formatId: 1, ruleSets: [{ id: 1, rules: { best_of: 3, score_structure: 'sets' } }] }] as any,
  httpStatus: null as number | null,
}));

vi.mock('../../../services/api', () => ({
  default: {
    get: vi.fn((url: string) => {
      if (String(url).endsWith('/matches/42')) {
        if (__state.httpStatus != null) {
          return Promise.reject({ response: { status: __state.httpStatus, data: { error: 'ERROR' } } });
        }
        return Promise.resolve({ data: { data: __state.match } });
      }
      return Promise.reject(new Error('unexpected url ' + url));
    }),
    post: vi.fn(),
  },
}));

vi.mock('../../../services/match-result.api', () => ({
  fetchMatchResult: vi.fn(() => Promise.resolve({ record: __state.record, participants: [] })),
  fetchSportFormats: vi.fn(() => Promise.resolve(__state.formats)),
  submitMatchResult: vi.fn(() => Promise.resolve({})),
  replaceMatchResult: vi.fn(() => Promise.resolve({})),
  withdrawMatchResult: vi.fn(() => Promise.resolve({})),
  acceptMatchResult: vi.fn(() => Promise.resolve({})),
  disputeMatchResult: vi.fn(() => Promise.resolve({})),
}));

vi.mock('../../../store/auth.store', () => ({
  useAuthStore: (sel: any) => sel({ user: { id: 1 } }),
}));

vi.mock('../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../../permissions/Can', () => ({
  Can: ({ children }: any) => <>{children}</>,
}));

vi.mock('../../../components/match-result/DynamicResultForm', () => ({
  default: () => <div data-testid="dynamic-form">form</div>,
}));

vi.mock('../../../components/match-result/ResultSummaryView', () => ({
  default: () => <div data-testid="result-summary">summary</div>,
}));

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/matches/42/result']}>
          <Routes>
            <Route path="/matches/:id/result" element={<MatchResultPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
};

describe('MatchResultPage — server-driven result states', () => {
  beforeEach(() => {
    __state.record = null;
    __state.httpStatus = null;
    __state.match.result_state = 'enter';
    (api.get as any).mockClear();
    (mrApi.fetchMatchResult as any).mockClear();
  });

  it('state A: no record + window open → enter-score form with a submit button', async () => {
    renderPage();
    expect(await screen.findByTestId('dynamic-form')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'matchResult.submit' })).toBeTruthy();
    expect(screen.queryByText('matchResult.expiredState')).toBeNull();
  });

  it('state C: no record + window expired → closed notice, no submission form', async () => {
    __state.match.result_state = 'expired';
    renderPage();
    expect(await screen.findByText('matchResult.expiredState')).toBeTruthy();
    expect(screen.queryByTestId('dynamic-form')).toBeNull();
    expect(screen.queryByRole('button', { name: 'matchResult.submit' })).toBeNull();
  });

  it('state F: pending confirmation shown to a reviewer → Accept / Dispute actions', async () => {
    __state.match.result_state = 'pending';
    __state.record = {
      id: 7,
      matchId: 42,
      submittedBy: 2,
      submissionStatus: 'pending_confirmation',
      outcome: 'completed',
      score: { sets: [{ home: 6, away: 4 }] },
    };
    renderPage();
    expect(await screen.findByTestId('result-summary')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'matchResult.accept' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'matchResult.dispute' })).toBeTruthy();
  });

  it('state E: disputed record → banner shown', async () => {
    __state.match.result_state = 'disputed';
    __state.record = {
      id: 7,
      matchId: 42,
      submittedBy: 1,
      submissionStatus: 'disputed',
      outcome: 'completed',
      score: { sets: [{ home: 6, away: 4 }] },
    };
    renderPage();
    expect(await screen.findByText('matchResult.disputedNotice')).toBeTruthy();
  });

  it('maps a 404 match to the not-found error state (no misleading form)', async () => {
    __state.httpStatus = 404;
    renderPage();
    expect(await screen.findByText('matchResult.notFound')).toBeTruthy();
    expect(screen.queryByTestId('dynamic-form')).toBeNull();
  });
});