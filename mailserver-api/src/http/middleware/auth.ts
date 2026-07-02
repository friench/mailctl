import type { Request, Response, NextFunction } from 'express';
import type { ApiKeyService } from '../../domain/apikeys/service';
import type { ApiKeyRow } from '../../db/schema';
import type { Logger } from '../../logger';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKey?: ApiKeyRow;
    }
  }
}

export function createApiKeyAuth(service: ApiKeyService, logger: Logger) {
  return function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
    const provided = req.headers['x-api-key'];
    const result = service.verify(provided);

    if (!result.ok) {
      logger.debug({ reason: result.reason }, 'API key rejected');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    req.apiKey = result.apiKey;

    try {
      service.touchLastUsed(result.apiKey.id);
    } catch (err) {
      logger.warn({ err, keyId: result.apiKey.id }, 'Failed to update last_used_at');
    }

    next();
  };
}
