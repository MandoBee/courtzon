/**
 * MatchDetailsDrawer — data presentation cleanup.
 *  - No raw internal ids (#resource_id / #referee_id / #booking_id / P{id}).
 *  - Venue / Official / Booking are separate sections.
 *  - Missing display names use the neutral localized label.
 *  - Existing score / winner / avatar behaviour is unaffected.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MatchDetailsDrawer } from '../MatchDetailsDrawer';
import type { TournamentMatchNode } from '../../../types/tournamentBracket';

vi.mock('../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string, d?: unknown) => (typeof d === 'string' ? d : k) }),
}));

const SCHEDULE = 'tournamentBracket.sectionSchedule';
const VENUE = 'tournamentBracket.sectionVenue';
const OFFICIAL = 'tournamentBracket.sectionOfficial';
const BOOKING = 'tournamentBracket.sectionBooking';
const NOT_AVAILABLE = 'tournamentBracket.notAvailable';
const WINNER = 'tournamentBracket.winner';

function m(partial: Partial<TournamentMatchNode> & { id: number }): TournamentMatchNode {
  return { tournament_id: 1, ...partial } as TournamentMatchNode;
}

function sectionFor(container: HTMLElement, title: string): HTMLElement | null {
  const heading = Array.from(container.querySelectorAll('h4')).find((h) => h.textContent === title);
  return heading ? (heading.closest('section') as HTMLElement) : null;
}

beforeEach(() => cleanup());

describe('MatchDetailsDrawer — no raw internal ids', () => {
  it('never renders ids when names are missing', () => {
    const nameless = m({
      id: 1, round: 1, bracket_position: 0,
      player1_id: 1, player2_id: 2,
      resource_id: 42, referee_id: 77, booking_id: 99,
      status: 'scheduled',
    });
    const { container } = render(<MatchDetailsDrawer open onClose={() => {}} match={nameless} />);
    const text = container.textContent || '';

    expect(text).not.toContain('#42');
    expect(text).not.toContain('#77');
    expect(text).not.toContain('#99');
    expect(text).not.toContain('P1');
    expect(text).not.toContain('P2');
    // The drawer never emits a raw-id marker at all.
    expect(text).not.toContain('#');

    // Neutral, localized fallback is used instead (participants + venue + official + booking).
    expect(screen.getAllByText(NOT_AVAILABLE).length).toBeGreaterThanOrEqual(4);
  });
});

describe('MatchDetailsDrawer — dedicated sections', () => {
  it('separates Schedule / Venue / Official / Booking', () => {
    const full = m({
      id: 1, round: 1, player1_name: 'Alpha', player2_name: 'Bravo', status: 'scheduled',
      start_time: '2026-10-01T10:00:00.000Z', end_time: '2026-10-01T11:00:00.000Z',
      resource_name: 'Court A', referee_name: 'Ref B', booking_id: 5,
    });
    const { container } = render(<MatchDetailsDrawer open onClose={() => {}} match={full} />);

    expect(screen.getByText(SCHEDULE)).toBeTruthy();
    expect(screen.getByText(VENUE)).toBeTruthy();
    expect(screen.getByText(OFFICIAL)).toBeTruthy();
    expect(screen.getByText(BOOKING)).toBeTruthy();

    const venue = sectionFor(container, VENUE);
    expect(venue?.textContent).toContain('Court A');
    expect(venue?.textContent).not.toContain('Ref B');

    const official = sectionFor(container, OFFICIAL);
    expect(official?.textContent).toContain('Ref B');
    expect(official?.textContent).not.toContain('Court A');

    // Venue/official/booking never leak into the Schedule section.
    const schedule = sectionFor(container, SCHEDULE);
    expect(schedule?.textContent).not.toContain('Court A');
    expect(schedule?.textContent).not.toContain('Ref B');

    const booking = sectionFor(container, BOOKING);
    expect(booking?.textContent).toContain(NOT_AVAILABLE);
  });

  it('omits sections that have no meaningful information', () => {
    const bare = m({ id: 1, round: 1, player1_name: 'Alpha', player2_name: 'Bravo', status: 'scheduled' });
    render(<MatchDetailsDrawer open onClose={() => {}} match={bare} />);
    expect(screen.queryByText(SCHEDULE)).toBeNull();
    expect(screen.queryByText(VENUE)).toBeNull();
    expect(screen.queryByText(OFFICIAL)).toBeNull();
    expect(screen.queryByText(BOOKING)).toBeNull();
  });

  it('uses the neutral label when only a venue id exists', () => {
    const venueOnly = m({
      id: 1, round: 1, player1_name: 'Alpha', player2_name: 'Bravo', status: 'scheduled',
      resource_id: 42,
    });
    const { container } = render(<MatchDetailsDrawer open onClose={() => {}} match={venueOnly} />);
    expect(screen.getByText(VENUE)).toBeTruthy();
    expect(sectionFor(container, VENUE)?.textContent).toContain(NOT_AVAILABLE);
    expect((container.textContent || '')).not.toContain('#42');
    expect(screen.queryByText(OFFICIAL)).toBeNull();
    expect(screen.queryByText(BOOKING)).toBeNull();
  });
});

describe('MatchDetailsDrawer — existing behaviour preserved', () => {
  it('keeps a single score, winner badge and avatars', () => {
    const completed = m({
      id: 1, round: 1, player1_id: 1, player2_id: 2,
      player1_name: 'Alpha', player2_name: 'Bravo',
      status: 'completed', score_summary: '2 - 0', winner_id: 1,
    });
    const { container } = render(<MatchDetailsDrawer open onClose={() => {}} match={completed} currentUserId={1} />);
    expect(screen.getAllByText('2 - 0')).toHaveLength(1);
    expect(screen.getAllByText(WINNER)).toHaveLength(1);
    expect(container.querySelectorAll('span[aria-hidden="true"]').length).toBeGreaterThanOrEqual(2);
  });

  it('keeps navigation controls when a match list is supplied', () => {
    const feeder = m({
      id: 101, round: 1, bracket_position: 0, player1_name: 'Alpha', player2_name: 'Bravo',
      progression_meta: { is_bracket: true, target_round: 2, target_bracket_position: 0, target_side: 'player1' } as any,
    });
    const target = m({ id: 103, round: 2, bracket_position: 0, player1_name: 'Alpha', player2_name: 'Charlie' });
    render(
      <MatchDetailsDrawer open onClose={() => {}} match={feeder} matches={[feeder, target]} onSelectMatch={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'tournamentBracket.nextMatch' })).toBeTruthy();
  });
});
