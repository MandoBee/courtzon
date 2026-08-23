// The player service (via database/mysql.js → config/env.js) validates required
// environment variables at import time and exits if they are missing. Provide a
// test-safe env BEFORE importing the module under test (same pattern as the other
// DB-backed integration specs). Production env validation is untouched.
vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root';
  process.env.DB_PASSWORD = 'courtzon2026';
  process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1';
  process.env.REDIS_PORT = '6379';
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-chars';
});

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { playerService } from '../application/player.service.js';

describe('PlayerService', () => {
  it('should be a singleton instance', () => {
    expect(playerService).toBeDefined();
    expect(playerService.getDashboard).toBeInstanceOf(Function);
    expect(playerService.getUpcoming).toBeInstanceOf(Function);
    expect(playerService.getStatistics).toBeInstanceOf(Function);
    expect(playerService.getQRProfile).toBeInstanceOf(Function);
    expect(playerService.searchPlayers).toBeInstanceOf(Function);
    expect(playerService.getPlayerProfile).toBeInstanceOf(Function);
    expect(playerService.getFavoriteClubs).toBeInstanceOf(Function);
    expect(playerService.addFavoriteClub).toBeInstanceOf(Function);
    expect(playerService.removeFavoriteClub).toBeInstanceOf(Function);
    expect(playerService.getFavoriteCoaches).toBeInstanceOf(Function);
    expect(playerService.getDevices).toBeInstanceOf(Function);
    expect(playerService.removeDevice).toBeInstanceOf(Function);
    expect(playerService.getAchievements).toBeInstanceOf(Function);
  });

  describe('getDashboard', () => {
    it('should return dashboard data structure', async () => {
      const result = await playerService.getDashboard(1);
      expect(result).toBeDefined();
      expect(result).toHaveProperty('wallet_balance');
      expect(result).toHaveProperty('unread_notifications');
      expect(result).toHaveProperty('upcoming_bookings');
      expect(result).toHaveProperty('upcoming_matches');
      expect(result).toHaveProperty('active_academy_enrollments');
      expect(result).toHaveProperty('active_tournament_registrations');
      expect(result).toHaveProperty('active_league_teams');
      expect(result).toHaveProperty('recent_activity');
      expect(Array.isArray(result.recent_activity)).toBe(true);
    });
  });

  describe('searchPlayers', () => {
    it('should search players with a query', async () => {
      const result = await playerService.searchPlayers('test', 1, 10);
      expect(result).toBeDefined();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should handle empty query gracefully', async () => {
      const result = await playerService.searchPlayers('', 1, 10);
      expect(result).toBeDefined();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
    });
  });

  describe('getQRProfile', () => {
    // NOTE: deliberately NOT 999999 — wallet.transaction.spec inserts/deletes
    // that exact id in the shared dev DB and runs in parallel with this file.
    const NON_EXISTENT_USER_ID = 999888777;

    it('should throw for non-existent user', async () => {
      await expect(playerService.getQRProfile(NON_EXISTENT_USER_ID)).rejects.toThrow('User not found');
    });
  });

  describe('getAchievements', () => {
    it('should return achievements array', async () => {
      const result = await playerService.getAchievements(1);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return default achievements when no targeted ones exist', async () => {
      const result = await playerService.getAchievements(999888777);
      expect(result.length).toBeGreaterThanOrEqual(5);
      expect(result[0]).toHaveProperty('key');
      expect(result[0]).toHaveProperty('title');
    });
  });
});
