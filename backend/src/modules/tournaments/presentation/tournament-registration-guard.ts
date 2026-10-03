import type { FastifyRequest, FastifyReply } from 'fastify';
import { hasOrgPermission } from '../../../shared/middleware/route-guard.js';
import { userHasRole } from '../../../shared/middleware/auth.middleware.js';
import { AppError } from '../../../shared/errors/app-error.js';

/**
 * Platform roles allowed to operate the tournament REGISTRATION PIPELINE
 * across organisations. `checkOrgPermission` (used by `hasOrgPermission`)
 * already exempts org OWNERS and `super_admin`/`super-admin` for any org;
 * `master-admin` is the additional cross-org Tournament Workbench role per
 * product policy (G11.21.4).
 */
export const PLATFORM_REGISTRATION_ROLES = ['super_admin', 'super-admin', 'master-admin'];

/**
 * G11.21.4 — organisation-aware guard for the ADMIN registration pipeline:
 *   POST /admin/tournaments/:id/register
 *   POST /admin/tournaments/registrations/:regId/cancel
 *   POST /admin/tournaments/registrations/:regId/confirm
 *
 * These legacy routes carry no `:orgId`, so the tenant is resolved FROM THE
 * RESOURCE (the tournament or its registration) instead of a path parameter:
 *
 *   • org owner / `super_admin`-for-any-org / an org-scope-granted holder of
 *     `tournament.register` in THAT organisation → allowed (the established
 *     `checkOrgPermission` semantics via `hasOrgPermission`);
 *   • `super_admin` / `super-admin` / `master-admin` → allowed cross-org;
 *   • anything else (foreign organisation OR nonexistent resource) → a 404
 *     with the SAME `{error, message}` shape, so a foreign id is
 *     indistinguishable from a nonexistent one (no existence leak).
 *
 * Callers lacking `tournament.register` are rejected EARLIER (403) by the
 * existing global `requirePermission` preHandler that runs before this guard.
 */
export function requireAdminRegistrationOrgScope(options: {
  /** Which route param holds the resource id: `id` (tournament) or `regId`. */
  idParam: 'id' | 'regId';
  errorCode: string;
  notFoundMessage: string;
  /** Resolve the owning organisation of the resource (null = nonexistent). */
  resolveOrgId: (id: number) => Promise<number | null>;
}) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const userId = (request as any).userId;
    if (!userId) {
      return reply.status(401).send({ error: 'AUTHENTICATION_ERROR', message: 'Not authenticated' });
    }

    const resourceId = Number((request.params as any)[options.idParam]);
    if (!Number.isInteger(resourceId) || resourceId <= 0) {
      throw new AppError('Invalid resource ID', 400, 'VALIDATION_ERROR', {});
    }

    const orgId = await options.resolveOrgId(resourceId);
    if (orgId == null) {
      // Nonexistent resource — identical shape to the foreign-resource denial.
      throw new AppError(options.notFoundMessage, 404, options.errorCode, {});
    }

    if (await hasOrgPermission(userId, orgId, 'tournament.register')) return;

    // Product policy (G11.21.4): platform admins may operate cross-org on the
    // Tournament Workbench, including `master-admin`.
    if (await userHasRole(userId, PLATFORM_REGISTRATION_ROLES)) return;

    // Foreign organisation — denied with the SAME shape as a nonexistent id.
    throw new AppError(options.notFoundMessage, 404, options.errorCode, {});
  };
}