import { describe, it, expect } from 'vitest';
import { assignNextParticipantSide, canOccupySide, sideOccupancyCounts } from '../domain/participant-side.js';
import type { MatchFormatSnapshot } from '../domain/match.types.js';

const singles: MatchFormatSnapshot = { formatId: 2, formatType: 'singles', playersPerSide: 1, name: 'Tennis Standard' };
const doubles: MatchFormatSnapshot = { formatId: 1, formatType: 'doubles', playersPerSide: 2, name: 'Padel Standard' };
const team11: MatchFormatSnapshot = { formatId: 3, formatType: 'team', playersPerSide: 11, name: 'Football 11v11' };
const teamUnconfigured: MatchFormatSnapshot = { formatId: 9, formatType: 'team', playersPerSide: null, name: 'Team (size unset)' };

describe('Group 2 — assignNextParticipantSide (authoritative assignment)', () => {
  it('host opens on home (teamIndex 0) for any format', () => {
    expect(assignNextParticipantSide(singles, [])).toEqual({ side: 'home', teamIndex: 0 });
    expect(assignNextParticipantSide(doubles, [])).toEqual({ side: 'home', teamIndex: 0 });
    expect(assignNextParticipantSide(team11, [])).toEqual({ side: 'home', teamIndex: 0 });
  });

  it('singles: exactly one participant per side (1 home, 1 away)', () => {
    const s1 = assignNextParticipantSide(singles, [])!; // home
    const s2 = assignNextParticipantSide(singles, [{ side: s1.side }])!; // away
    expect(s1.side).toBe('home');
    expect(s2.side).toBe('away');
    expect(s2.teamIndex).toBe(1);
  });

  it('doubles: two participants per side, home fills before away', () => {
    const a = assignNextParticipantSide(doubles, [])!; // home
    const b = assignNextParticipantSide(doubles, [{ side: a.side }])!; // home (2nd)
    const c = assignNextParticipantSide(doubles, [{ side: a.side }, { side: b.side }])!; // away
    const d = assignNextParticipantSide(doubles, [{ side: a.side }, { side: b.side }, { side: c.side }])!; // away (2nd)
    expect([a.side, b.side]).toEqual(['home', 'home']);
    expect([c.side, d.side]).toEqual(['away', 'away']);
    expect([a.teamIndex, c.teamIndex]).toEqual([0, 1]);
  });

  it('team: uses players_per_side dynamically (home fills to 11 before away)', () => {
    const existing = Array.from({ length: 11 }, () => ({ side: 'home' as const }));
    const next = assignNextParticipantSide(team11, existing)!;
    expect(next.side).toBe('away');
    expect(next.teamIndex).toBe(1);
  });

  it('team with NULL players_per_side balances sides — no invented team size', () => {
    const home1 = assignNextParticipantSide(teamUnconfigured, [])!; // home
    const away = assignNextParticipantSide(teamUnconfigured, [{ side: home1.side }])!; // away (balanced)
    const home2 = assignNextParticipantSide(teamUnconfigured, [{ side: home1.side }, { side: away.side }])!; // home (tie)
    expect(home1.side).toBe('home');
    expect(away.side).toBe('away');
    expect(home2.side).toBe('home');
  });

  it('format-less match returns null (legacy fallback preserved)', () => {
    expect(assignNextParticipantSide(null, [])).toBeNull();
    expect(assignNextParticipantSide(null, [{ side: 'home' }])).toBeNull();
  });

  it('never fabricates a side when the format is unknown', () => {
    const result = assignNextParticipantSide(null, []);
    expect(result).toBeNull();
  });
});

describe('Group 3 — canOccupySide (authoritative occupancy validation)', () => {
  const occ = (arr: Array<['home' | 'away', number]>) => arr.map(([side, userId]) => ({ side, userId }));

  it('singles allows exactly one participant per side', () => {
    const full = occ([['home', 1], ['away', 2]]);
    expect(canOccupySide(singles, full, 'home').ok).toBe(false);
    expect(canOccupySide(singles, full, 'away').ok).toBe(false);
    expect(canOccupySide(singles, occ([['home', 1]]), 'away').ok).toBe(true);
  });

  it('doubles respects players_per_side = 2', () => {
    const home2 = occ([['home', 1], ['home', 2]]);
    expect(canOccupySide(doubles, home2, 'home')).toEqual({ ok: false, reason: 'side_full' });
    expect(canOccupySide(doubles, home2, 'away').ok).toBe(true);
  });

  it('team respects configured players_per_side dynamically', () => {
    const home10 = occ(Array.from({ length: 10 }, (_, i) => ['home', 100 + i] as const));
    expect(canOccupySide(team11, home10, 'home').ok).toBe(true);
    const home11 = occ(Array.from({ length: 11 }, (_, i) => ['home', 100 + i] as const));
    expect(canOccupySide(team11, home11, 'home')).toEqual({ ok: false, reason: 'side_full' });
  });

  it('unconfigured team format imposes no per-side cap (no invented size)', () => {
    const many = occ(Array.from({ length: 25 }, (_, i) => ['home', 100 + i] as const));
    expect(canOccupySide(teamUnconfigured, many, 'home').ok).toBe(true);
  });

  it('format-less legacy match has no authoritative capacity', () => {
    expect(canOccupySide(null, occ([['home', 1], ['home', 2], ['home', 3]]), 'home').ok).toBe(true);
  });

  it('exposes per-side occupancy counts', () => {
    expect(sideOccupancyCounts(occ([['home', 1], ['away', 2], ['away', 3]]))).toEqual({ home: 1, away: 2 });
  });
});