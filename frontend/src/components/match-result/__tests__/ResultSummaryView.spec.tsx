import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ResultSummaryView from '../ResultSummaryView';
import type { MatchResultRecord, MatchResultParticipant } from '../../../types/match-result';

vi.mock('../../../i18n', () => ({
  useTranslation: () => ({
    t: (key: string, defOrParams?: unknown, params?: Record<string, string | number>) => {
      const defaults: Record<string, string> = {
        'matchResult.format': 'Format: {format}',
        'matchResult.playedAt': 'Played',
        'matchResult.venue': 'Venue',
        'matchResult.tournament': 'Tournament',
        'matchResult.round': 'Round',
        'matchResult.team': 'Team {n}',
        'matchResult.winner': 'Winner',
        'matchResult.drawNoRating': 'Draw / no result for rating',
        'matchResult.playerLabel': 'Player #{id}',
        'matchResult.rating': 'Rating',
        'matchResult.home': 'Home',
        'matchResult.away': 'Away',
        'matchResult.outcome.win': 'Win',
        'matchResult.outcome.draw': 'Draw',
        'matchResult.outcome.loss': 'Loss',
        'matchResult.statusApproved': 'Approved',
        'matchResult.statusPending': 'Pending confirmation',
        'matchResult.disputeLabel': 'Dispute',
        'matchResult.autoApprovedNotice': 'Auto-approved',
      };
      const value = defaults[key] ?? key;
      const paramBag = typeof defOrParams === 'object' && defOrParams !== null
        ? defOrParams as Record<string, string | number>
        : params;
      if (paramBag) {
        let out = value;
        for (const [k, v] of Object.entries(paramBag)) out = out.replace(`{${k}}`, String(v));
        return out;
      }
      return value;
    },
  }),
}));

function makeRecord(overrides: Partial<MatchResultRecord> = {}): MatchResultRecord {
  return {
    id: 1,
    matchId: 42,
    sportId: 22,
    formatId: 1,
    ruleSetId: 1,
    rulesSnapshot: { score_structure: 'sets', draw_allowed: false, terminations: [] },
    matchType: 'public',
    playedAt: '2026-09-01 10:00:00',
    branchId: 3,
    resourceId: 9,
    tournamentId: null,
    academyId: null,
    timezone: null,
    participantPayload: [],
    rawResult: { outcome: 'completed' },
    finalResult: { winner: 'home', scoreSummary: '2-0', sideOutcomes: { home: 'win', away: 'loss' }, sideEvidence: { home: 100, away: 0 } },
    outcome: 'completed',
    submissionStatus: 'approved',
    submittedBy: 5,
    submittedAt: null,
    acceptedBy: null,
    acceptedAt: null,
    autoApproved: false,
    disputedBy: null,
    disputedAt: null,
    disputeReason: null,
    resolvedBy: null,
    resolvedAt: null,
    resolutionNote: null,
    submissionDeadlineAt: null,
    autoApprovalDeadlineAt: null,
    evidenceCounted: false,
    ratingAppliedAt: null,
    createdAt: '2026-09-01 11:00:00',
    updatedAt: '2026-09-01 12:00:00',
    ...overrides,
  };
}

function participant(overrides: Partial<MatchResultParticipant> = {}): MatchResultParticipant {
  return {
    id: 10,
    resultId: 1,
    matchId: 42,
    userId: 5,
    teamIndex: 0,
    side: 'home',
    outcome: 'win',
    matchEvidence: 100,
    evidenceCounted: true,
    ratingSnapshotPercent: 60,
    ratingBefore: 60,
    ratingAfter: 62,
    ...overrides,
  };
}

const withContext = (record: MatchResultRecord, parts: MatchResultParticipant[]) => {
  (record as any).sport = { sportId: 22, sportName: 'Padel', sportIcon: '/uploads/sport/icon/padel.webp' };
  (record as any).format = { formatId: 1, formatName: 'Padel Standard', formatType: 'doubles', playersPerSide: 2 };
  (record as any).venue = { organisationId: 7, organisationName: 'Org One', branchId: 3, branchName: 'MASPIRO', resourceId: 9, resourceName: 'Court 1' };
  (record as any).tournament = null;
  (record as any).participants = parts;
  return record;
};

describe('ResultSummaryView — Group 4 read model display', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('renders the REAL player display name instead of #userId', async () => {
    const record = makeRecord();
    const parts = [
      participant({ id: 10, userId: 5, displayName: 'Ahmed Ali', avatarUrl: '/uploads/avatar/a.png', side: 'home', outcome: 'win' }),
      participant({ id: 11, userId: 6, displayName: 'Sara', avatarUrl: null, side: 'away', outcome: 'loss' }),
    ];
    render(<ResultSummaryView record={withContext(record, parts)} participants={parts} />);

    expect(screen.getByText('Ahmed Ali')).toBeTruthy();
    expect(screen.getByText('Sara')).toBeTruthy();
    expect(screen.queryByText('Player #5')).toBeNull();
    expect(screen.queryByText('Player #6')).toBeNull();
  });

  it('renders the avatar when available and a letter fallback when absent', async () => {
    const record = makeRecord();
    const parts = [
      participant({ id: 10, userId: 5, displayName: 'Ahmed Ali', avatarUrl: '/uploads/avatar/a.png', side: 'home', outcome: 'win' }),
      participant({ id: 11, userId: 6, displayName: 'Sara', avatarUrl: null, side: 'away', outcome: 'loss' }),
    ];
    render(<ResultSummaryView record={withContext(record, parts)} participants={parts} />);

    expect(screen.getByAltText('Ahmed Ali')).toBeTruthy();
    expect(screen.getByTitle('Sara')).toBeTruthy();
  });

  it('falls back to a safe label when displayName is missing entirely', async () => {
    const record = makeRecord();
    const parts = [
      participant({ id: 10, userId: 5, displayName: null, avatarUrl: null, side: 'home', outcome: 'win' }),
    ];
    render(<ResultSummaryView record={withContext(record, parts)} participants={parts} />);
    expect(screen.getByText('Player #5')).toBeTruthy();
  });

  it('renders sport, format, venue and date context', async () => {
    const record = makeRecord();
    const parts = [participant({ side: 'home', outcome: 'win' })];
    render(<ResultSummaryView record={withContext(record, parts)} participants={parts} />);

    expect(screen.getByText('Padel')).toBeTruthy();
    expect(screen.getByText(/Padel Standard/)).toBeTruthy();
    expect(screen.getByText(/MASPIRO/)).toBeTruthy();
    expect(screen.getByText(/Org One/)).toBeTruthy();
    expect(screen.getByText(/Court 1/)).toBeTruthy();
    expect(screen.getByText(/Played/)).toBeTruthy();
  });

  it('renders tournament + round when applicable', async () => {
    const record = makeRecord({ matchType: 'tournament', tournamentId: 11 });
    (record as any).tournament = { tournamentId: 11, tournamentName: 'City Open', round: 2, roundName: 'Quarter-Final', stageId: 5, stageName: 'Knockout' };
    const parts = [participant({ side: 'home', outcome: 'win' }), participant({ id: 11, userId: 6, side: 'away', outcome: 'loss' })];
    render(<ResultSummaryView record={record} participants={parts} />);

    expect(screen.getByText(/City Open/)).toBeTruthy();
    expect(screen.getByText(/Quarter-Final/)).toBeTruthy();
  });

  it('normal public match shows NO tournament info', async () => {
    const record = makeRecord();
    const parts = [participant({ side: 'home', outcome: 'win' }), participant({ id: 11, userId: 6, side: 'away', outcome: 'loss' })];
    render(<ResultSummaryView record={withContext(record, parts)} participants={parts} />);

    expect(screen.queryByText(/Tournament/)).toBeNull();
    expect(screen.queryByText(/Round/)).toBeNull();
  });

  it('singles match renders two clear sides', async () => {
    const record = makeRecord();
    const parts = [
      participant({ id: 10, userId: 5, displayName: 'Ahmed Ali', side: 'home', outcome: 'win' }),
      participant({ id: 11, userId: 6, displayName: 'Sara', side: 'away', outcome: 'loss' }),
    ];
    render(<ResultSummaryView record={withContext(record, parts)} participants={parts} />);

    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Away')).toBeTruthy();
  });

  it('doubles/team match groups all participants by side (no exactly-two assumption)', async () => {
    const record = makeRecord();
    (record as any).format = { formatId: 1, formatName: 'Padel Standard', formatType: 'doubles', playersPerSide: 2 };
    const parts = [
      participant({ id: 10, userId: 5, displayName: 'Ahmed Ali', teamIndex: 0, side: 'home', outcome: 'win' }),
      participant({ id: 11, userId: 6, displayName: 'Omar', teamIndex: 0, side: 'home', outcome: 'win' }),
      participant({ id: 12, userId: 7, displayName: 'Sara', teamIndex: 1, side: 'away', outcome: 'loss' }),
      participant({ id: 13, userId: 8, displayName: 'Lina', teamIndex: 1, side: 'away', outcome: 'loss' }),
    ];
    render(<ResultSummaryView record={withContext(record, parts)} participants={parts} />);

    expect(screen.getByText('Ahmed Ali')).toBeTruthy();
    expect(screen.getByText('Omar')).toBeTruthy();
    expect(screen.getByText('Sara')).toBeTruthy();
    expect(screen.getByText('Lina')).toBeTruthy();
    expect(screen.getAllByText('Win')).toHaveLength(2);
    expect(screen.getAllByText('Loss')).toHaveLength(2);
  });
});