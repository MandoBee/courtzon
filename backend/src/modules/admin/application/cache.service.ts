import { getRedisClient } from '../../../infrastructure/redis/redis.client.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { recordAudit } from '../../audit-log/index.js';

const log = createModuleLogger('admin-cache');

export class CacheService {
  async getStats(): Promise<{
    hits: number;
    misses: number;
    memory: Record<string, unknown>;
    keys: number;
    uptime: number;
    connectedClients: number;
  }> {
    const redis = getRedisClient();
    const infoRaw: string = await redis.info('stats');
    const memoryRaw: string = await redis.info('memory');
    const keyspaceRaw: string = await redis.info('keyspace');
    const serverRaw: string = await redis.info('server');
    const clientsRaw: string = await redis.info('clients');

    const parseInfo = (text: string): Record<string, string> => {
      const result: Record<string, string> = {};
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes(':')) continue;
        const sep = trimmed.indexOf(':');
        result[trimmed.slice(0, sep)] = trimmed.slice(sep + 1);
      }
      return result;
    };

    const stats = parseInfo(infoRaw);
    const mem = parseInfo(memoryRaw);
    const keyspace = parseInfo(keyspaceRaw);
    const server = parseInfo(serverRaw);
    const clients = parseInfo(clientsRaw);

    let totalKeys = 0;
    for (const val of Object.values(keyspace)) {
      const match = val.match(/keys=(\d+)/);
      if (match) totalKeys += parseInt(match[1], 10);
    }

    return {
      hits: parseInt(stats.keyspace_hits || '0', 10),
      misses: parseInt(stats.keyspace_misses || '0', 10),
      memory: {
        usedMemory: mem.used_memory_human || '0',
        peakMemory: mem.used_memory_peak_human || '0',
        fragmentation: mem.mem_fragmentation_ratio || '0',
        allocator: mem.allocator_frag_ratio || 'N/A',
      },
      keys: totalKeys,
      uptime: parseInt(server.uptime_in_seconds || '0', 10),
      connectedClients: parseInt(clients.connected_clients || '0', 10),
    };
  }

  async clear(key: string): Promise<{ key: string; cleared: boolean }> {
    const redis = getRedisClient();
    const result = await redis.del(key);
    return { key, cleared: result > 0 };
  }

  async clearAll(userId: number): Promise<void> {
    const redis = getRedisClient();
    await redis.flushdb();

    recordAudit({
      actorId: userId,
      action: 'CACHE.FLUSH',
      entityType: 'cache',
    });
  }
}

export const cacheService = new CacheService();
