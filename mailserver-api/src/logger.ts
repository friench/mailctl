import pino from 'pino';
import type { Env } from './env';

export function createLogger(env: Pick<Env, 'LOG_LEVEL' | 'NODE_ENV'>) {
  return pino({
    level: env.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers["x-api-key"]',
        'req.headers.cookie',
        '*.password',
        '*.password_hash',
        '*.api_key',
      ],
      remove: true,
    },
    ...(env.NODE_ENV === 'development'
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'HH:MM:ss.l' },
          },
        }
      : {}),
  });
}

export type Logger = ReturnType<typeof createLogger>;
