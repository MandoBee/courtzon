import type { FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../errors/app-error.js';

export function createFeatureFlagMiddleware(isFeatureEnabled: (key: string) => Promise<boolean>) {
  return function requireFeatureFlag(flagKey: string) {
    return async (_request: FastifyRequest, reply: FastifyReply) => {
      const enabled = await isFeatureEnabled(flagKey);
      if (!enabled) {
        throw new ForbiddenError('This feature is currently disabled');
      }
    };
  };
}
