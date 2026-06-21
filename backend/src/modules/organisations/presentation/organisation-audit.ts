import type { FastifyRequest } from 'fastify';
import { recordAudit } from '../../audit-log/index.js';

/** Shared audit helper for organisations module mutations (A5b). */
export function auditOrganisationMutation(
  request: FastifyRequest,
  action: string,
  entityType: string,
  entityId: number | null | undefined,
  afterState?: Record<string, unknown>,
): void {
  recordAudit({
    actorId: (request as any).userId ?? null,
    action,
    entityType,
    entityId: entityId ?? undefined,
    afterState,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
}
