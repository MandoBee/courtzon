import { describe, it, expect } from 'vitest';
import { CreateTournamentSchema, UpdateTournamentSchema, CreateCompetitionSchema } from '../presentation/tournament.dto.js';

const base = {
  bracket_type_id: 1,
  name: 'UAT Padel',
  max_participants: 16,
  min_participants: 2,
  entry_fee: 800,
  currency_code: 'AED',
  price_type: 'FIXED',
  start_date: '2026-10-01',
  end_date: '2026-10-05',
};

describe('CreateTournamentSchema — start_date NOT NULL contract', () => {
  it('accepts a valid start_date', () => {
    expect(() => CreateTournamentSchema.parse(base)).not.toThrow();
  });

  it('rejects a MISSING start_date before repository execution', () => {
    const { start_date: _ignored, ...rest } = base;
    expect(() => CreateTournamentSchema.parse(rest)).toThrow();
  });

  it('rejects an empty start_date', () => {
    expect(() => CreateTournamentSchema.parse({ ...base, start_date: '' })).toThrow();
  });

  it('keeps start_date OPTIONAL on partial updates (UpdateTournamentSchema)', () => {
    expect(() => UpdateTournamentSchema.parse({ name: 'Renamed' })).not.toThrow();
  });
});

// ── G11.21.3 — competition category configuration contract ───────────────────
const competitionBase = { competition_type: 'singles', name: 'G11.21.3 Category' };

describe('G11.21.3 CreateCompetitionSchema — payment methods & currency', () => {
  it('accepts cash/card payment methods, alone or together', () => {
    for (const methods of [['cash'], ['card'], ['cash', 'card']]) {
      expect(() => CreateCompetitionSchema.parse({ ...competitionBase, registration_payment_methods: methods })).not.toThrow();
    }
  });

  it('rejects unsupported payment methods (crypto / wallet / bank_transfer)', () => {
    for (const bad of ['crypto', 'wallet', 'bank_transfer']) {
      expect(() => CreateCompetitionSchema.parse({ ...competitionBase, registration_payment_methods: [bad] })).toThrow();
    }
  });

  it('rejects an EMPTY payment-method allowlist (min 1)', () => {
    expect(() => CreateCompetitionSchema.parse({ ...competitionBase, registration_payment_methods: [] })).toThrow();
  });

  it('rejects DUPLICATE payment methods (competition write path has no service-side dedupe)', () => {
    expect(() => CreateCompetitionSchema.parse({ ...competitionBase, registration_payment_methods: ['cash', 'cash'] })).toThrow();
  });

  it('accepts null / omitted registration_payment_methods (inherit the tournament allowlist)', () => {
    expect(() => CreateCompetitionSchema.parse({ ...competitionBase, registration_payment_methods: null })).not.toThrow();
    expect(() => CreateCompetitionSchema.parse(competitionBase)).not.toThrow();
  });

  it('normalizes " sar " to "SAR" at the DTO boundary', () => {
    const out = CreateCompetitionSchema.parse({ ...competitionBase, currency_code: ' sar ' });
    expect(out.currency_code).toBe('SAR');
  });

  it('normalizes lowercase input to uppercase', () => {
    expect(CreateCompetitionSchema.parse({ ...competitionBase, currency_code: 'aed' }).currency_code).toBe('AED');
  });

  it('rejects invalid currency shapes (too short/long, digits, symbols, blank)', () => {
    for (const bad of ['EG', 'EGPS', 'US1', '$$$', '', '   ']) {
      expect(() => CreateCompetitionSchema.parse({ ...competitionBase, currency_code: bad })).toThrow();
    }
  });

  it('keeps currency_code OPTIONAL (backend inherits the tournament currency)', () => {
    expect(CreateCompetitionSchema.parse(competitionBase).currency_code).toBeUndefined();
  });
});