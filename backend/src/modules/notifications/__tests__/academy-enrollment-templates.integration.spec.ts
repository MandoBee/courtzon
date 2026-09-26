// ============================================================================
// Academy G3-A — enrollment-cancelled/completed template wiring (integration)
//
// Runs against the shared local Docker MySQL (courtzon_v3). Verifies that the
// two new templates are seeded by the EXISTING idempotent startup mechanism
// (`seedTemplates()` — no migration, no manual SQL) and resolve via the shared
// `getTemplate()` lookup with the correct /my/academy navigation and
// interpolation variables.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { closePool, getPool } from '../../../database/mysql.js';

process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3307';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'courtzon2026';
process.env.DB_NAME = 'courtzon_v3';

import { seedTemplates, getTemplate, resolveTemplate } from '../application/template.service.js';

const EVENTS = ['academy:enrollment-cancelled', 'academy:enrollment-completed'];

const ENV = { cancelled: 'Tennis Club', completed: 'Squash Academy' };

let pool: any;

beforeAll(async () => {
  pool = getPool();
  // The same mechanism the server runs at startup — idempotent.
  await seedTemplates();
});

afterAll(async () => {
  await closePool();
});

describe('G3-A — academy cancelled/completed templates seeded + resolvable', () => {
  it('seedTemplates() is idempotent: exactly one row per (event, locale) after two seeds', async () => {
    await seedTemplates(); // second run must not duplicate
    for (const event of EVENTS) {
      for (const locale of ['en', 'ar']) {
        const [rows] = await pool.execute(
          'SELECT COUNT(*) AS c FROM notification_templates WHERE event_name = ? AND locale = ?',
          [event, locale],
        );
        expect(Number(rows[0].c), `${event}/${locale} row count`).toBe(1);
      }
    }
  });

  it('getTemplate() resolves both events in EN and AR with /my/academy navigation', async () => {
    for (const event of EVENTS) {
      const en = await getTemplate(event, 'en');
      expect(en).not.toBeNull();
      expect(en!.categorySlug).toBe('system');
      expect(en!.actionKey).toBe('view_my_academy');
      expect(en!.routePattern).toBe('/my/academy');

      const ar = await getTemplate(event, 'ar');
      expect(ar).not.toBeNull();
      expect(ar!.categorySlug).toBe('system');
      expect(ar!.actionKey).toBe('view_my_academy');
      expect(ar!.routePattern).toBe('/my/academy');
      // AR must NOT silently fall back to EN (the AR row exists).
      expect(ar!.locale).toBe('ar');
    }
  });

  it('interpolation variables resolve from the G1 payload (programName)', async () => {
    const cancelled = await getTemplate('academy:enrollment-cancelled', 'en');
    const resolvedC = resolveTemplate(cancelled!, { programName: ENV.cancelled });
    expect(resolvedC.title).toContain('Cancelled');
    expect(resolvedC.body).toContain(ENV.cancelled);

    const completed = await getTemplate('academy:enrollment-completed', 'en');
    const resolvedP = resolveTemplate(completed!, { programName: ENV.completed });
    expect(resolvedP.title).toContain('Completed');
    expect(resolvedP.body).toContain(ENV.completed);
  });
});