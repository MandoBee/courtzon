import { describe, it, expect } from 'vitest';
import { composeTournamentDescription, type TournamentDescriptionInput } from '../application/tournament-description.service.js';

const full: TournamentDescriptionInput = {
  name: 'Padel Open',
  sport: 'Padel',
  bracketType: 'Single Elimination',
  format: 'knockout',
  matchFormat: 'Padel Standard',
  matchFormatType: 'doubles',
  gender: ['male', 'female'],
  ageLabel: '18-34',
  levelLabel: 'Advanced',
  category: 'Community Cup',
  season: '2026',
  startDate: '2026-10-01',
  endDate: '2026-10-05',
  venueName: 'Club A',
  entryFee: 100,
  currency: 'EGP',
  minParticipants: 4,
  maxParticipants: 16,
  prizes: [
    { placement: 1, type: 'cash', description: null, amount: 500 },
    { placement: 2, type: 'trophy', description: 'Silver Cup', amount: null },
  ],
  sponsors: [
    { name: 'Acme', type: 'cash', description: null, amount: 1000 },
    { name: 'Trophy Co', type: 'inkind', description: 'Medals and trophies' },
  ],
};

describe('tournament description composer (pure, deterministic)', () => {
  it('is deterministic for identical input', () => {
    expect(composeTournamentDescription(full)).toBe(composeTournamentDescription(full));
  });

  it('includes structured sections with the expected wording', () => {
    const out = composeTournamentDescription(full);
    expect(out).toContain('Padel Open');
    expect(out).toContain('Format: Padel · Doubles · Padel Standard · Single Elimination');
    expect(out).toContain('Category: Men / Women · 18-34 · Advanced');
    expect(out).toContain('Classification: Community Cup · 2026');
    expect(out).toContain('Dates: 2026-10-01 to 2026-10-05');
    expect(out).toContain('Venue: Club A');
    expect(out).toContain('Entry fee 100.00 EGP');
    expect(out).toContain('4-16 participants');
  });

  it('distinguishes CASH vs IN-KIND prizes and never emits monetary values', () => {
    const out = composeTournamentDescription(full);
    expect(out).toContain('Prizes:');
    expect(out).toContain('1st place: Cash');
    expect(out).toContain('2nd place: Trophy — Silver Cup');
    expect(out).not.toContain('500'); // prize amounts are never composed
  });

  it('includes sponsors with names/types; IN-KIND description; no amounts', () => {
    const out = composeTournamentDescription(full);
    expect(out).toContain('Sponsors:');
    expect(out).toContain('- Acme (Cash)');
    expect(out).toContain('- Trophy Co (In-kind) — Medals and trophies');
    expect(out).not.toContain('1000');
  });

  it('derives singles/doubles/team solely from matchFormatType', () => {
    expect(composeTournamentDescription({ name: 'T', matchFormatType: 'singles' })).toContain('Format: Singles');
    expect(composeTournamentDescription({ name: 'T', matchFormatType: 'doubles' })).toContain('Format: Doubles');
    expect(composeTournamentDescription({ name: 'T', matchFormatType: 'team' })).toContain('Format: Team');
  });

  it('handles missing optional fields without empty/awkward sections', () => {
    const out = composeTournamentDescription({ name: 'T', sport: 'Padel' });
    expect(out).toBe('T\nFormat: Padel');
    expect(out).not.toContain('Category:');
    expect(out).not.toContain('Fees:');
    expect(out).not.toContain('Prizes:');
    expect(out).not.toContain('Sponsors:');
  });

  it('never includes the rules snapshot in the description', () => {
    expect(composeTournamentDescription({ name: 'T', rules: 'X' as any })).toBe('T');
  });

  it('handles entry-fee=0 as free', () => {
    const out = composeTournamentDescription({ name: 'T', entryFee: 0, isFree: true });
    expect(out).toContain('Fees: Free entry');
  });
});