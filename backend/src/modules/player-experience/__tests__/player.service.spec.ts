import { describe, it, expect } from 'vitest';
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
});
