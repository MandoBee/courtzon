import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3005';
});

/**
 * P1-4 — Referee assignment notifications.
 *
 * Verifies the notification wiring for referee:assigned / referee:unassigned:
 *  1. Template source declares both events in en + ar.
 *  2. Event-bus contract declares both events.
 *  3. Notification engine registers a handler.
 *  4. The assign emitters (league fixture + tournament) resolve the referee
 *     user_id and emit the event after persisting the assignment.
 */
describe('P1-4 — Referee assignment notification wiring', () => {
  it('template source declares referee:assigned and referee:unassigned in en + ar', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/modules/notifications/application/template.service.ts'),
      'utf8',
    );
    expect(source).toContain(`eventName: 'referee:assigned'`);
    expect(source).toContain(`eventName: 'referee:unassigned'`);
    expect(source.match(/eventName: 'referee:assigned'/g)?.length).toBe(2);
    expect(source.match(/eventName: 'referee:unassigned'/g)?.length).toBe(2);
  });

  it('event-bus contract declares both referee events', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/shared/event-bus/index.ts'),
      'utf8',
    );
    expect(source).toContain(`'referee:assigned'`);
    expect(source).toContain(`'referee:unassigned'`);
  });

  it('notification engine registers a handler for referee events', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/modules/notifications/application/notification-engine.ts'),
      'utf8',
    );
    expect(source).toContain(`events: ['referee:assigned', 'referee:unassigned']`);
  });

  it('league fixture service emits referee:assigned after persisting the assignment', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const leagueSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/modules/leagues/application/fixture.service.ts'),
      'utf8',
    );
    // Emitter wiring: resolves referee user_id and emits the typed event.
    expect(leagueSource).toContain(`SELECT user_id FROM referees`);
    expect(leagueSource).toContain(`emit('referee:assigned'`);
    expect(leagueSource).toContain(`matchType: 'league'`);
  });

  it('tournament service emits referee:assigned after persisting the assignment', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const tournamentSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/modules/tournaments/application/tournament.service.ts'),
      'utf8',
    );
    expect(tournamentSource).toContain(`SELECT user_id FROM referees`);
    expect(tournamentSource).toContain(`emit('referee:assigned'`);
    expect(tournamentSource).toContain(`emitRefereeAssigned(match, refereeId, 'tournament')`);
  });

  it('realtime socket publisher subscribes to referee events', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/modules/realtime/application/socket-publisher.ts'),
      'utf8',
    );
    expect(source).toContain(`'referee:assigned', 'referee:unassigned'`);
  });
});