import pino, { type Logger } from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Root structured logger. Pretty-prints in dev, emits line-delimited JSON in prod
 * (ready for Better Stack / any log drain). Use `logger.child({ requestId })` per
 * tRPC call and `logger.child({ jobId })` per worker job for traceable context.
 */
export const logger: Logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss.l' } }
    : undefined,
  redact: ['*.password', '*.passwordHash', '*.secret', 'req.headers.authorization'],
});

export type { Logger };
