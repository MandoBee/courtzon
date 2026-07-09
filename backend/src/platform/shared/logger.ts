import { createModuleLogger } from '../../shared/utils/logger.js';

export function createPlatformLogger(platform: string, context?: Record<string, unknown>) {
  return createModuleLogger(`platform:${platform}`, { platform, ...context });
}

export type PlatformLogger = ReturnType<typeof createPlatformLogger>;
