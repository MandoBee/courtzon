import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// G11 Phase 4 — integration gateway tournament contract:
//   * list must select the REAL schema column `max_participants` (the old
//     `max_players` does not exist and returned a DB error on production);
//   * the detail handler must NOT `SELECT * FROM tournaments` (which leaked
//     internal ledger/financial columns).
describe('Integration gateway — tournament contract (G11 Phase 4)', () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(resolve(dir, '../presentation/integration.controller.ts'), 'utf8');

  it('gatewayListTournamentsHandler uses max_participants, not the non-existent max_players', () => {
    const h = src.slice(src.indexOf('gatewayListTournamentsHandler'));
    expect(h).toContain('max_participants');
    expect(h).not.toMatch(/max_players/);
  });

  it('gatewayGetTournamentHandler returns an explicit column list — no SELECT *, no financial leakage', () => {
    const h = src.slice(src.indexOf('gatewayGetTournamentHandler'));
    expect(h).not.toMatch(/SELECT \* FROM tournaments/);
    // Inspect ONLY the detail SELECT column list (comments may explain why the
    // internal columns are excluded — the SELECT itself must not contain them).
    const selectStart = h.indexOf('SELECT id, name, format, status, start_date');
    const selectEnd = h.indexOf('FROM tournaments WHERE id = ?');
    expect(selectStart).toBeGreaterThan(-1);
    expect(selectEnd).toBeGreaterThan(selectStart);
    const selectList = h.slice(selectStart, selectEnd);
    expect(selectList).toContain('max_participants');
    for (const leaked of ['commission_rate', 'organisation_id', 'tournament_type', 'branch_id', 'creator_id']) {
      expect(selectList, `${leaked} must not appear in the detail SELECT`).not.toContain(leaked);
    }
  });
});