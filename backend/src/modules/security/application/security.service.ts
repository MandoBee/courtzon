import { securityRepository } from '../infrastructure/security.repository.js';

class SecurityService {
  async getDashboard() {
    const [stats, alerts, redisInfo] = await Promise.all([
      securityRepository.getSecurityDashboard(),
      securityRepository.getRecentSecurityAlerts(10),
      securityRepository.getRedisInfo(),
    ]);
    return { ...stats, alerts, redis: redisInfo };
  }

  async getActiveSessions(limit?: number, offset?: number) {
    const [sessions, total] = await Promise.all([
      securityRepository.getActiveSessions(limit, offset),
      securityRepository.countActiveSessions(),
    ]);
    return { data: sessions, total, limit, offset };
  }

  async getSuspiciousSessions(limit?: number) {
    return securityRepository.getSuspiciousSessions(limit);
  }

  async revokeSession(sessionId: number) {
    await securityRepository.revokeSession(sessionId);
  }

  async getFailedLoginStats(days?: number) {
    return securityRepository.getFailedLoginStats(days);
  }

  async getFailedLoginFeed(limit?: number) {
    return securityRepository.getFailedLoginFeed(limit);
  }

  async getUploadSecurityStats(days?: number) {
    return securityRepository.getUploadSecurityStats(days);
  }

  async getRecentUploads(limit?: number) {
    return securityRepository.getRecentUploads(limit);
  }

  async getRecentSecurityAlerts(limit?: number) {
    return securityRepository.getRecentSecurityAlerts(limit);
  }

  async getOrganisationSecurity() {
    return securityRepository.getOrganisationSecurityOverview();
  }

  async getRoleAuditLog() {
    return securityRepository.getRoleAuditLog();
  }

  async getRedisInfo() {
    return securityRepository.getRedisInfo();
  }
}

export const securityService = new SecurityService();
