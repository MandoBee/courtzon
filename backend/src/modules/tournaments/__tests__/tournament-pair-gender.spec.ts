import { describe, it, expect } from 'vitest';
import { enforcePairGenderRule } from '../domain/tournament-pair-gender.js';

describe('Phase 1 — pair gender rule (server-authoritative)', () => {
  it('mixed-only competition requires exactly one male and one female', () => {
    expect(() =>
      enforcePairGenderRule(
        [{ userId: 1, playerGender: 'male' }, { userId: 2, playerGender: 'female' }],
        ['mixed'],
      ),
    ).not.toThrow();
  });

  it('mixed-only competition rejects a same-gender pair', () => {
    expect(() =>
      enforcePairGenderRule(
        [{ userId: 1, playerGender: 'male' }, { userId: 2, playerGender: 'male' }],
        ['mixed'],
      ),
    ).toThrow(/exactly one male and one female/);
  });

  it('mixed-only competition rejects members without a recorded gender', () => {
    expect(() =>
      enforcePairGenderRule(
        [{ userId: 1, playerGender: 'male' }, { userId: 2, playerGender: null }],
        ['mixed'],
      ),
    ).toThrow(/no recorded gender/);
  });

  it('men-only competition rejects a female member and accepts an all-male pair', () => {
    expect(() =>
      enforcePairGenderRule(
        [{ userId: 1, playerGender: 'male' }, { userId: 2, playerGender: 'female' }],
        ['male'],
      ),
    ).toThrow(/men-only/);
    expect(() =>
      enforcePairGenderRule(
        [{ userId: 1, playerGender: 'male' }, { userId: 2, playerGender: 'male' }],
        ['male'],
      ),
    ).not.toThrow();
  });

  it('women-only competition rejects a male member', () => {
    expect(() =>
      enforcePairGenderRule(
        [{ userId: 1, playerGender: 'female' }, { userId: 2, playerGender: 'male' }],
        ['female'],
      ),
    ).toThrow(/women-only/);
  });

  it('open or multi-category competitions impose no gender constraint', () => {
    expect(() =>
      enforcePairGenderRule(
        [{ userId: 1, playerGender: 'male' }, { userId: 2, playerGender: 'male' }],
        [],
      ),
    ).not.toThrow();
    expect(() =>
      enforcePairGenderRule(
        [{ userId: 1, playerGender: 'male' }, { userId: 2, playerGender: 'male' }],
        ['male', 'female'],
      ),
    ).not.toThrow();
  });

  it('single-member participants are not subject to the pair rule', () => {
    expect(() => enforcePairGenderRule([{ userId: 1, playerGender: 'female' }], ['mixed'])).not.toThrow();
  });
});