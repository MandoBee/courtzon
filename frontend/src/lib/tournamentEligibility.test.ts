import { describe, it, expect } from 'vitest';
import {
  TOURNAMENT_AGE_YOUTH,
  TOURNAMENT_AGE_MASTERS,
  TOURNAMENT_JUNIOR_EVEN,
  TOURNAMENT_JUNIOR_ODD,
  TOURNAMENT_SENIOR_MIN_AGES,
  TOURNAMENT_GENDER_OPTIONS,
  ELIGIBILITY_ERROR_KEYS,
  ageCategoryLabelKey,
  tournamentEligibilityErrorCode,
  translateEligibilityError,
} from './tournamentEligibility';
import * as presentation from './tournamentEligibility';

describe('G7-D eligibility presentation constants', () => {
  it('renders open eligibility semantics (constants only — never IDs in labels)', () => {
    expect(ageCategoryLabelKey(1)).toContain('tournaments.eligibility');
    expect(TOURNAMENT_AGE_YOUTH.map((c) => c.labelKey)).toEqual([
      'tournaments.eligibility.age.categories.u14',
      'tournaments.eligibility.age.categories.u16',
      'tournaments.eligibility.age.categories.u18',
      'tournaments.eligibility.age.categories.u8',
      'tournaments.eligibility.age.categories.u10',
      'tournaments.eligibility.age.categories.u12',
      'tournaments.eligibility.age.categories.u20',
      'tournaments.eligibility.age.categories.u22',
      'tournaments.eligibility.age.categories.u7',
      'tournaments.eligibility.age.categories.u9',
      'tournaments.eligibility.age.categories.u11',
      'tournaments.eligibility.age.categories.u13',
      'tournaments.eligibility.age.categories.u15',
      'tournaments.eligibility.age.categories.u17',
      'tournaments.eligibility.age.categories.u19',
      'tournaments.eligibility.age.categories.u21',
    ]);
  });

  it('defines the even/odd junior patterns and the full senior minimum-age list', () => {
    // Even pattern reuses the legacy u14/u16/u18 ids for backward compatibility.
    expect(TOURNAMENT_JUNIOR_EVEN.map((c) => c.id)).toEqual([100, 101, 102, 1, 2, 3, 103, 104]);
    expect(TOURNAMENT_JUNIOR_EVEN.map((c) => c.labelKey)).toContain('tournaments.eligibility.age.categories.u22');
    expect(TOURNAMENT_JUNIOR_ODD.map((c) => c.id)).toEqual([110, 111, 112, 113, 114, 115, 116, 117]);
    expect(TOURNAMENT_SENIOR_MIN_AGES.map((c) => c.slug)).toEqual([
      '35_plus', '40_plus', '45_plus', '50_plus', '55_plus', '60_plus', '65_plus', '70_plus', '75_plus',
    ]);
  });

  it('youth and masters families are disjoint (cannot be selected together)', () => {
    const youthIds = new Set(TOURNAMENT_AGE_YOUTH.map((c) => c.id));
    const mastersIds = TOURNAMENT_AGE_MASTERS.map((c) => c.id);
    for (const id of mastersIds) {
      expect(youthIds.has(id)).toBe(false);
    }
    expect(TOURNAMENT_AGE_YOUTH.every((c) => c.family === 'youth')).toBe(true);
    expect(TOURNAMENT_AGE_MASTERS.every((c) => c.family === 'masters')).toBe(true);
  });

  it('gender options are multi-select male/female/mixed', () => {
    expect(TOURNAMENT_GENDER_OPTIONS.map((g) => g.value)).toEqual(['male', 'female', 'mixed']);
    for (const g of TOURNAMENT_GENDER_OPTIONS) {
      expect(g.labelKey).toContain('tournaments.eligibility.gender.');
    }
  });

  it('maps every backend eligibility error to a translation key (no raw codes to users)', () => {
    for (const code of [
      'AGE_NOT_ELIGIBLE',
      'GENDER_NOT_ELIGIBLE',
      'LEVEL_NOT_ELIGIBLE',
      'MISSING_BIRTH_DATE',
      'MISSING_PLAYER_LEVEL',
      'INVALID_AGE_CATEGORIES',
      'ELIGIBILITY_LOCKED',
    ]) {
      expect(ELIGIBILITY_ERROR_KEYS[code]).toBeDefined();
    }
  });

  it('translateEligibilityError resolves via errorCode and falls back gracefully', () => {
    const tMock = (key: string, def?: string) => def ?? key;
    const mapped = translateEligibilityError(tMock as any, { response: { data: { errorCode: 'AGE_NOT_ELIGIBLE' } } }, 'Fallback');
    expect(mapped).toBe('tournaments.errors.ageNotEligible');

    const fallback = translateEligibilityError(tMock as any, new Error('network'), 'Fallback message');
    expect(fallback).toBe('Fallback message');
  });

  it('extracts the eligibility code from api and thrown-error shapes', () => {
    expect(tournamentEligibilityErrorCode({ response: { data: { errorCode: 'LEVEL_NOT_ELIGIBLE' } } })).toBe('LEVEL_NOT_ELIGIBLE');
    expect(tournamentEligibilityErrorCode({ errorCode: 'MISSING_BIRTH_DATE' })).toBe('MISSING_BIRTH_DATE');
    expect(tournamentEligibilityErrorCode(new Error('x'))).toBeUndefined();
  });

  it('has NO month/day age calculation and NO notification-level filter (presentation only)', () => {
    // The presentation module exposes only constants + error mapping — it never
    // computes an age and never exposes any notification-targeting API.
    const api = Object.keys(presentation);
    expect(api.some((k) => /age.*(month|day|today)|notif|audience/i.test(k))).toBe(false);
  });
});