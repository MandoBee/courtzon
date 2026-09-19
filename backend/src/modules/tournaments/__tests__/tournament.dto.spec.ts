import { describe, it, expect } from 'vitest';
import { CreateTournamentSchema, UpdateTournamentSchema } from '../presentation/tournament.dto.js';

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