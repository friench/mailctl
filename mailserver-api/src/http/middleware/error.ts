import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import type { Logger } from '../../logger';
import { BusinessError } from '../../lib/errors';

export function createErrorHandler(logger: Logger) {
  return function errorHandler(
    err: unknown,
    req: Request,
    res: Response,
    _next: NextFunction,
  ): void {
    if (err instanceof BusinessError) {
      res.status(err.status).json({ error: err.message, ...(err.code && { code: err.code }) });
      return;
    }

    if (err instanceof ZodError) {
      res.status(400).json({
        error: 'Validation error',
        issues: err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
      return;
    }

    const error = err as Error;
    logger.error({ err: error, url: req.url, method: req.method }, 'Unhandled request error');
    res.status(500).json({ error: 'Internal server error' });
  };
}
