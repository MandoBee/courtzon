import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPool, getPool, closePool } from '../../../database/mysql.js';
import { sportConfigAdminService } from '../application/sport-config.admin.service.js';
import { matchResultRepository } from '../infrastructure/match-result.repository.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';

/**
 * Phase A integration — runs against the CONFIRMED local development database
 * (127.0.0.1:3307 / courtzon_v3 — see vitest.integration.setup.ts). Fully
 * self-cleaning: every inserted row is removed in afterAll; the test uses a
 * far-range sport id so it can never collide with real data.
 */

const SPORT_ID = 995001;

const VALID_RULES = {
  score_structure: 'sets',
  best_of: 3,
  sets_to_win: 2,
  first_to: 6,
  margin: 2,
  draw_allowed: false,
  terminations: ['retired', 'walkover', 'forfeit', 'abandoned'],
};

const V2_RULES = {
  ...VALID_RULES,
  best_of: 5,
  sets_to_win: 3,
};

const STANDINGS = {
  points: { win: 3, draw: 1, loss: 0 },
  tiebreakers: [{ field: 'points', direction: 'desc' }],
};

let actorId = 1;
let referenceMatchId: number | null = null;

const FORMAT_IDS: number[] = [];
const RULE_SET_IDS: number[] = [];
let sportInserted = false;

beforeAll(async () => {
  // The integration config's setup file already defaults to the local dev DB;
  // pin them again here so the spec is runnable even outside that config.
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
  process.env.DB_PORT = process.env.DB_PORT || '3307';
  process.env.DB_USER = process.env.DB_USER || 'root';
  process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'courtzon2026';
  process.env.DB_NAME = process.env.DB_NAME || 'courtzon_v3';

  createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const pool = getPool();
  const [actorRows] = await pool.execute<any[]>('SELECT id FROM users ORDER BY id LIMIT 1');
  if (actorRows.length) actorId = actorRows[0].id;

  await pool.execute(
    'INSERT IGNORE INTO sports (id, name, slug) VALUES (?, ?, ?)',
    [SPORT_ID, 'Integration Padel', `itest-padel-${Date.now()}`],
  );
  const [existing] = await pool.execute<any[]>(
    'SELECT id FROM sports WHERE id = ?',
    [SPORT_ID],
  );
  sportInserted = existing.length > 0;
}, 30000);

afterAll(async () => {
  const pool = getPool();
  if (referenceMatchId != null) {
    await pool.execute('DELETE FROM matches WHERE id = ?', [referenceMatchId]);
  }
  if (RULE_SET_IDS.length) {
    await pool.execute(
      `DELETE FROM sport_rule_sets WHERE id IN (${RULE_SET_IDS.map(() => '?').join(',')})`,
      RULE_SET_IDS,
    );
  }
  if (FORMAT_IDS.length) {
    await pool.execute(
      `DELETE FROM sport_formats WHERE id IN (${FORMAT_IDS.map(() => '?').join(',')})`,
      FORMAT_IDS,
    );
  }
  if (sportInserted) {
    await pool.execute('DELETE FROM sports WHERE id = ?', [SPORT_ID]);
  }
  await closePool();
}, 30000);

describe('Phase A sport-config — integration (local dev DB, self-cleaning)', () => {
  it('creates a format and auto-activates its FIRST rule-set version', async () => {
    const created = await sportConfigAdminService.createFormat(
      SPORT_ID,
      { slug: 'singles', name: 'Padel Singles', formatType: 'singles', playersPerSide: 1 },
      actorId,
    );
    FORMAT_IDS.push(created.id);

    const v1 = await sportConfigAdminService.createRuleSet(
      created.id,
      { name: 'v1', rules: VALID_RULES, standingsRules: STANDINGS },
      actorId,
    );
    RULE_SET_IDS.push(v1.id);

    expect(v1.version).toBe(1);
    expect(v1.isActive).toBe(true);
    expect(v1.standingsRules?.points.win).toBe(3);

    const active = await matchResultRepository.findActiveRuleSetForFormat(created.id);
    expect(active).not.toBeNull();
    expect(active!.ruleSetId).toBe(v1.id);
    expect(active!.version).toBe(1);
  });

  it('creates a second version as an INACTIVE draft and leaves v1 byte-identical (snapshot preservation)', async () => {
    const pool = getPool();
    const formatId = FORMAT_IDS[0];
    const [before] = await pool.execute<any[]>(
      'SELECT rules FROM sport_rule_sets WHERE format_id = ? AND version = 1',
      [formatId],
    );
    const beforeJson = JSON.stringify(before[0].rules);

    const v2 = await sportConfigAdminService.createRuleSet(
      formatId,
      { name: 'v2 best of 5', rules: V2_RULES },
      actorId,
    );
    RULE_SET_IDS.push(v2.id);

    expect(v2.version).toBe(2);
    expect(v2.isActive).toBe(false); // draft — explicit activation required

    const [after] = await pool.execute<any[]>(
      'SELECT rules FROM sport_rule_sets WHERE format_id = ? AND version = 1',
      [formatId],
    );
    // The historical version row is untouched (byte-identical JSON).
    expect(JSON.stringify(after[0].rules)).toBe(beforeJson);

    // Live resolution still points at v1 (a draft never leaks into resolution).
    const active = await matchResultRepository.findActiveRuleSetForFormat(formatId);
    expect(active!.ruleSetId).toBe(RULE_SET_IDS[0]);
  });

  it('activating v2 enforces the single-active invariant; existing match references are NEVER rewritten', async () => {
    const pool = getPool();
    const formatId = FORMAT_IDS[0];
    const v1 = RULE_SET_IDS[0];
    const v2 = RULE_SET_IDS[1];

    // Historical reference: a `matches` row frozen to format + v1.
    const [res] = await pool.execute<any[]>(
      `INSERT INTO matches (type, status, sport_id, format_id, rule_set_id)
       VALUES ('public', 'open', ?, ?, ?)`,
      [SPORT_ID, formatId, v1],
    );
    referenceMatchId = res.insertId;

    const activated = await sportConfigAdminService.activateRuleSet(v2, actorId);
    expect(activated.isActive).toBe(true);

    const v1Row = await matchResultRepository.findRuleSetAdminById(v1);
    expect(v1Row!.isActive).toBe(false); // single-active invariant

    const [matches] = await pool.execute<any[]>(
      'SELECT format_id, rule_set_id FROM matches WHERE id = ?',
      [referenceMatchId],
    );
    // The historical row is untouched — its frozen ids still point at v1.
    expect(Number(matches[0].format_id)).toBe(formatId);
    expect(Number(matches[0].rule_set_id)).toBe(v1);
  });

  it('scoring edits on a REFERENCED version are blocked (409 semantic); metadata still allowed', async () => {
    await expect(
      sportConfigAdminService.updateRuleSet(RULE_SET_IDS[0], { name: 'tamper', rules: { ...VALID_RULES, best_of: 7 } }, actorId),
    ).rejects.toMatchObject({ code: ErrorCodes.SPORT_RULE_SET_IN_USE });

    const renamed = await sportConfigAdminService.updateRuleSet(RULE_SET_IDS[0], { name: 'v1 (renamed)' }, actorId);
    expect(renamed.name).toBe('v1 (renamed)');
  });

  it('referenced format cannot be deleted (SPORT_FORMAT_IN_USE); unreferenced format deletes cleanly', async () => {
    await expect(sportConfigAdminService.deleteFormat(FORMAT_IDS[0], actorId))
      .rejects.toMatchObject({ code: ErrorCodes.SPORT_FORMAT_IN_USE });

    // An untouched format (no rule sets, no references) is deletable.
    const empty = await sportConfigAdminService.createFormat(
      SPORT_ID,
      { slug: 'obsolete', name: 'Obsolete', formatType: 'doubles', playersPerSide: 2 },
      actorId,
    );
    const detail = await sportConfigAdminService.getFormatDetail(empty.id);
    expect(detail.referenceCount).toBe(0);

    await sportConfigAdminService.deleteFormat(empty.id, actorId);
    const gone = await matchResultRepository.findAdminFormatById(empty.id);
    expect(gone).toBeNull();
    FORMAT_IDS.push(empty.id);
  });

  it('unreferenced version scoring edits persist (draft correction)', async () => {
    const formatId = FORMAT_IDS[0];
    const draft = await sportConfigAdminService.createRuleSet(
      formatId,
      { name: 'draft', rules: VALID_RULES },
      actorId,
    );
    RULE_SET_IDS.push(draft.id);

    const updated = await sportConfigAdminService.updateRuleSet(
      draft.id,
      { rules: { ...VALID_RULES, margin: 1 } },
      actorId,
    );
    expect(updated.referenceCount).toBe(0);
    // v2 rules remain untouched — only the draft was corrected.
    const v2Row = await matchResultRepository.findRuleSetAdminById(RULE_SET_IDS[1]);
    expect(v2Row!.rules.best_of).toBe(5);
  });

  it('every mutation writes an audit log entry', async () => {
    const pool = getPool();
    const ids = FORMAT_IDS.concat(RULE_SET_IDS).join(',');
    const [rows] = await pool.execute<any[]>(
      `SELECT action FROM audit_logs
       WHERE entity_type IN ('sport_formats', 'sport_rule_sets')
         AND entity_id IN (${ids})
       ORDER BY id`,
    );
    const actions = rows.map((r) => r.action);
    expect(actions).toContain('sport_format.created');
    expect(actions).toContain('sport_rule_set.created');
    expect(actions).toContain('sport_rule_set.activated');
    expect(actions).toContain('sport_format.deleted');
    expect(actions).toContain('sport_rule_set.updated');
  });

  it('validates rules via the shared engine — impossible configs are rejected end-to-end', async () => {
    const formatId = FORMAT_IDS[0];
    await expect(
      sportConfigAdminService.createRuleSet(formatId, { name: 'broken', rules: { score_structure: 'sets', tiebreak_at: 6 } }, actorId),
    ).rejects.toThrow('tiebreak_first_to');
  });
});