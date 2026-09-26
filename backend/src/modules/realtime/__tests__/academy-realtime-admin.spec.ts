import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mapDomainEvent } from '../application/socket-event-mapper.js';

/**
 * G4-A — Academy administrative realtime audience.
 *
 * Verifies:
 *   - the approved admin events are allowlisted on SocketPublisher
 *   - mapper room routing delivers org/branch/super-admin rooms for the admin
 *     events, the coach's user room for attendance, the player room for
 *     player-scoped events (never for admin state), and preserves enrollment
 *     player + org + admin routing
 *   - cross-tenant isolation (org A never reaches org B; branch scoping)
 */
const SOCKET_PUBLISHER_SOURCE = fs.readFileSync(
  path.resolve(process.cwd(), 'src/modules/realtime/application/socket-publisher.ts'),
  'utf-8',
);

const roomsOf = (e: string, p: any) => mapDomainEvent(e, p as any)!.rooms ?? [];
const contains = (rooms: string[], prefix: string, id: number | string) =>
  rooms.includes(`${prefix}:${id}`);

describe('G4-A — socket publisher allowlist (administrative events)', () => {
  it('allowlists hold-expired, group-updated, schedule-updated, attendance-updated', () => {
    for (const e of [
      'academy:session:hold-expired',
      'academy:group-updated',
      'academy:schedule-updated',
      'academy:attendance-updated',
    ]) {
      expect(SOCKET_PUBLISHER_SOURCE).toContain(`'${e}'`);
    }
  });
});

describe('G4-A — hold-expired → administrative audience only (never players)', () => {
  const payload = {
    sessionId: 10, groupId: 20, scheduleId: 30, date: '2026-10-04',
    organisationId: 9, branchId: 5,
  };

  it('maps to academy.session.hold-expired (no truncation) with org/branch/admin rooms', () => {
    const mapped = mapDomainEvent('academy:session:hold-expired', payload as any);
    expect(mapped!.type).toBe('academy.session.hold-expired');
    expect(mapped!.rooms).toContain('organisation:9');
    expect(mapped!.rooms).toContain('branch:5');
    expect(mapped!.rooms).toContain('admin');
  });

  it('never reaches a player (no user:<id> room) and preserves the payload', () => {
    const mapped = mapDomainEvent('academy:session:hold-expired', {
      ...payload, playerId: 42,
    } as any);
    expect(mapped!.rooms.some((r) => r.startsWith('user:'))).toBe(false);
    expect(mapped!.payload).toMatchObject({ sessionId: 10, groupId: 20, scheduleId: 30, organisationId: 9, branchId: 5 });
  });

  it('cross-tenant: a hold in org A never reaches org B / branch B', () => {
    const rooms = roomsOf('academy:session:hold-expired', payload);
    expect(contains(rooms, 'organisation', 9)).toBe(true);
    expect(contains(rooms, 'organisation', 10)).toBe(false);
    expect(contains(rooms, 'branch', 5)).toBe(true);
    expect(contains(rooms, 'branch', 6)).toBe(false);
  });
});

describe('G4-A — group / schedule / attendance admin routing', () => {
  it('group-updated → org/branch/admin rooms with authoritative IDs', () => {
    const mapped = mapDomainEvent('academy:group-updated', {
      groupId: 7, programId: 1, organisationId: 9, branchId: 5, coachId: 88,
    } as any);
    expect(mapped!.type).toBe('academy.group-updated');
    expect(mapped!.rooms).toContain('organisation:9');
    expect(mapped!.rooms).toContain('branch:5');
    expect(mapped!.rooms).toContain('admin');
    // Admin state is never routed to a player room.
    expect(mapped!.rooms.some((r) => r.startsWith('user:'))).toBe(false);
  });

  it('schedule-updated → org/branch/admin rooms', () => {
    const mapped = mapDomainEvent('academy:schedule-updated', {
      scheduleId: 3, groupId: 7, programId: 1, organisationId: 9, branchId: 5,
    } as any);
    expect(mapped!.type).toBe('academy.schedule-updated');
    expect(mapped!.rooms).toContain('organisation:9');
    expect(mapped!.rooms).toContain('branch:5');
    expect(mapped!.rooms).toContain('admin');
  });

  it('attendance-updated → org/branch/admin rooms + the group coach user room, NOT the player', () => {
    const mapped = mapDomainEvent('academy:attendance-updated', {
      attendanceId: 1, sessionId: 10, groupId: 20, enrollmentId: 5, playerId: 42,
      organisationId: 9, branchId: 5, coachId: 88,
    } as any);
    expect(mapped!.type).toBe('academy.attendance-updated');
    expect(mapped!.rooms).toContain('organisation:9');
    expect(mapped!.rooms).toContain('branch:5');
    expect(mapped!.rooms).toContain('admin');
    // Coach audience — the coach's authoritative USER room (not coach:<id>, which
    // is never joined server-side).
    expect(mapped!.rooms).toContain('user:88');
    expect(mapped!.rooms.some((r) => r === 'user:42')).toBe(false);
  });
});

describe('G4-A — enrollment lifecycle keeps player + admin rooms; session-started stays player-only', () => {
  it('enrollment-accepted → player room + org room + admin room', () => {
    const mapped = mapDomainEvent('academy:enrollment-accepted', {
      programId: 1, userId: 42, enrollmentId: 5, programName: 'P', organisationId: 9,
    } as any);
    expect(mapped!.type).toBe('academy.enrollment-accepted');
    expect(mapped!.rooms).toContain('user:42');
    expect(mapped!.rooms).toContain('organisation:9');
    expect(mapped!.rooms).toContain('admin');
  });

  it('regression: session-started remains player-only (no org/admin rooms)', () => {
    const mapped = mapDomainEvent('academy:session-started', {
      sessionId: 10, programId: 1, userId: 42, organisationId: 9,
    } as any);
    expect(mapped!.rooms).toContain('user:42');
    expect(mapped!.rooms.some((r) => r.startsWith('organisation:'))).toBe(false);
    expect(mapped!.rooms).not.toContain('admin');
  });

  it('regression: coaching events remain user-scoped (unchanged)', () => {
    const mapped = mapDomainEvent('coaching:session-scheduled', { sessionId: 3, userId: 7, coachId: 9 });
    expect(mapped!.type).toBe('coaching.session-scheduled');
    expect(mapped!.rooms).toContain('user:7');
    expect(mapped!.rooms.some((r) => r.startsWith('organisation:'))).toBe(false);
    expect(mapped!.rooms).not.toContain('admin');
  });

  it('cross-tenant: player A enrollment reaches org A, never org B', () => {
    const rooms = roomsOf('academy:enrollment-accepted', {
      programId: 1, userId: 42, enrollmentId: 5, organisationId: 9,
    });
    expect(contains(rooms, 'organisation', 9)).toBe(true);
    expect(contains(rooms, 'organisation', 99)).toBe(false);
  });
});