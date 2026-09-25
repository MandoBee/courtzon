import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OrgMatchResultsPage from '../OrgMatchResultsPage';
import { ToastProvider } from '../../../../components/ui/Toast';

const __records = vi.hoisted(() => [] as any[]);

vi.mock('../../../../services/match-result.api', () => ({
  fetchOrgResults: vi.fn(() => Promise.resolve({ records: __records, total: __records.length })),
  fetchSportFormats: vi.fn(() => Promise.resolve([])),
  resolveOrgDispute: vi.fn(),
  correctOrgResult: vi.fn(),
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../../../permissions/Can', () => ({
  Can: ({ children }: any) => <>{children}</>,
}));

vi.mock('../../../../components/match-result/DynamicResultForm', () => ({
  default: () => <div />,
}));

function makeListItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    matchId: 42,
    sportId: 22,
    formatId: 1,
    ruleSetId: 1,
    rulesSnapshot: { score_structure: 'sets', draw_allowed: false, terminations: [] },
    matchType: 'tournament',
    playedAt: '2026-09-01 10:00:00',
    branchId: 3,
    resourceId: 9,
    tournamentId: 11,
    academyId: null,
    timezone: null,
    participantPayload: [],
    rawResult: { outcome: 'completed' },
    finalResult: { winner: 'home', scoreSummary: '2-1', sideOutcomes: { home: 'win', away: 'loss' }, sideEvidence: { home: 100, away: 0 } },
    outcome: 'completed',
    submissionStatus: 'disputed',
    submittedBy: 5,
    submittedAt: null,
    acceptedBy: null,
    acceptedAt: null,
    autoApproved: false,
    disputedBy: 6,
    disputedAt: '2026-09-01 13:00:00',
    disputeReason: 'score is not correct',
    resolvedBy: null,
    resolvedAt: null,
    resolutionNote: null,
    submissionDeadlineAt: null,
    autoApprovalDeadlineAt: null,
    evidenceCounted: false,
    ratingAppliedAt: null,
    createdAt: '2026-09-01 11:00:00',
    updatedAt: '2026-09-01 13:00:00',
    sport: { sportId: 22, sportName: 'Padel', sportIcon: null },
    format: { formatId: 1, formatName: 'Padel Standard', formatType: 'singles', playersPerSide: 1 },
    venue: { organisationId: 28, organisationName: 'Org One', branchId: 3, branchName: 'MASPIRO', resourceId: 9, resourceName: 'Court 1' },
    tournament: { tournamentId: 11, tournamentName: 'City Open', round: 1, roundName: 'Round of 16', stageId: 5, stageName: 'Knockout' },
    participants: [
      { id: 10, resultId: 1, matchId: 42, userId: 5, teamIndex: 0, side: 'home', outcome: 'win', matchEvidence: 100, evidenceCounted: true, ratingSnapshotPercent: 60, ratingBefore: 60, ratingAfter: 62, displayName: 'Ahmed Ali', avatarUrl: null },
      { id: 11, resultId: 1, matchId: 42, userId: 6, teamIndex: 1, side: 'away', outcome: 'loss', matchEvidence: 0, evidenceCounted: true, ratingSnapshotPercent: 60, ratingBefore: 60, ratingAfter: 58, displayName: 'Sara', avatarUrl: null },
    ],
    ...overrides,
  };
}

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/org/28/match-results']}>
          <Routes>
            <Route path="/org/:orgId/match-results" element={<OrgMatchResultsPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
};

describe('OrgMatchResultsPage — Group 4 participants passthrough', () => {
  beforeEach(() => {
    __records.length = 0;
  });

  it('passes real participants + org-scoped display context into the result card', async () => {
    __records.push(makeListItem());
    renderPage();
    expect(await screen.findByText('Ahmed Ali')).toBeTruthy();
    expect(screen.getByText('Sara')).toBeTruthy();
    expect(screen.getByText(/City Open/)).toBeTruthy();
    expect(screen.getByText(/MASPIRO/)).toBeTruthy();
  });

  it('renders empty state when the org has no results', async () => {
    renderPage();
    expect(await screen.findByText('matchResult.noResults')).toBeTruthy();
  });
});