import type { FastifyRequest, FastifyReply } from 'fastify';
import { rbacRepository } from '../../modules/rbac/infrastructure/repositories/rbac.repository.js';
import { ForbiddenError } from '../errors/app-error.js';

export function requireFeatureFlag(flagKey: string) {
  return async (_request: FastifyRequest, reply: FastifyReply) => {
    const enabled = await rbacRepository.isFeatureEnabled(flagKey);
    if (!enabled) {
      throw new ForbiddenError('This feature is currently disabled');
    }
  };
}
