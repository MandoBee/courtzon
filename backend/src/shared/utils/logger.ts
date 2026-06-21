import pino from 'pino';

const rootLogger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss Z' } }
    : undefined,
  redact: ['req.headers.authorization', 'req.headers.cookie', 'body.password', 'body.token'],
});

export function createModuleLogger(module: string, context?: Record<string, unknown>) {
  return rootLogger.child({ module, ...context });
}

export { rootLogger as logger };
