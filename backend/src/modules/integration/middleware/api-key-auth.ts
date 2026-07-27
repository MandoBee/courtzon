import type { FastifyRequest, FastifyReply } from 'fastify';
import { createHash } from 'node:crypto';
import { apiKeyRepository } from '../infrastructure/repositories/api-key.repository.js';

export async function apiKeyAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const apiKey = request.headers['x-api-key'] as string | undefined;

  if (apiKey) {
    const hash = createHash('sha256').update(apiKey).digest('hex');
    const key = await apiKeyRepository.findByKeyHash(hash);
    if (!key) {
      reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid or expired API key' });
      return;
    }
    (request as any).userId = key.user_id;
    (request as any).apiKeyId = key.id;
    (request as any).apiKeyScopes = key.scopes;
    (request as any).authType = 'api_key';
    apiKeyRepository.updateLastUsed(key.id).catch(() => {});
    return;
  }

  // Fallback to session auth
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    (request as any).authType = 'session';
    return; // Let authMiddleware handle it
  }

  reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Missing API key or authentication' });
}
