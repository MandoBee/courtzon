import { describe, it, expect } from 'vitest';
import { buildUserRooms, createSocketEvent, shouldBroadcastToRoom } from '../domain/realtime-aggregate.js';

describe('Realtime Aggregate', () => {
  describe('buildUserRooms', () => {
    it('creates user room', () => {
      const rooms = buildUserRooms(42, [], [], []);
      expect(rooms).toContain('user:42');
    });

    it('adds organisation rooms', () => {
      const rooms = buildUserRooms(1, [], [5, 10], []);
      expect(rooms).toContain('organisation:5');
      expect(rooms).toContain('organisation:10');
    });

    it('adds branch rooms', () => {
      const rooms = buildUserRooms(1, [], [], [3, 7]);
      expect(rooms).toContain('branch:3');
      expect(rooms).toContain('branch:7');
    });

    it('adds superadmin room for super_admin role', () => {
      const rooms = buildUserRooms(1, ['super_admin'], [], []);
      expect(rooms).toContain('superadmin');
      expect(rooms).toContain('finance');
    });

    it('does not add superadmin for normal user', () => {
      const rooms = buildUserRooms(1, ['player'], [], []);
      expect(rooms).not.toContain('superadmin');
    });
  });

  describe('createSocketEvent', () => {
    it('creates event with timestamp', () => {
      const event = createSocketEvent('test.event', { id: 1 });
      expect(event.type).toBe('test.event');
      expect(event.payload).toEqual({ id: 1 });
      expect(event.timestamp).toBeTruthy();
    });
  });

  describe('shouldBroadcastToRoom', () => {
    it('broadcasts to user rooms', () => {
      expect(shouldBroadcastToRoom('user:42', 'booking:created')).toBe(true);
    });
    it('broadcasts to superadmin', () => {
      expect(shouldBroadcastToRoom('superadmin', 'any:event')).toBe(true);
    });
    it('broadcasts to booking rooms', () => {
      expect(shouldBroadcastToRoom('booking:5', 'booking:confirmed')).toBe(true);
    });
  });
});
