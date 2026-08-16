import { securityRepository } from '../infrastructure/security.repository.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';

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
    const session = await securityRepository.getSessionById(sessionId);
    await securityRepository.revokeSession(sessionId);
    if (session?.user_id) {
      eventBusV2.emit('security:session-revoked', { userId: session.user_id, sessionId }, {
        aggregateType: 'session',
        aggregateId: String(sessionId),
        aggregateVersion: 1,
      });
    }
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
