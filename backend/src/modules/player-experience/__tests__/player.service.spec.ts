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
    it('should throw for non-existent user', async () => {
      await expect(playerService.getQRProfile(999999)).rejects.toThrow('User not found');
    });
  });

  describe('getAchievements', () => {
    it('should return achievements array', async () => {
      const result = await playerService.getAchievements(1);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return default achievements when no targeted ones exist', async () => {
      const result = await playerService.getAchievements(999999);
      expect(result.length).toBeGreaterThanOrEqual(5);
      expect(result[0]).toHaveProperty('key');
      expect(result[0]).toHaveProperty('title');
    });
  });
});
