import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ApiKeyService } from '../../domain/apikeys/service';
import type { UserRepository } from '../../domain/users/repository';
import type { Logger } from '../../logger';

/**
 * Admin auth: accepts either a logged-in session OR an API key with `admin` scope.
 * Status codes:
 *   401 — no session and no/invalid api key
 *   403 — valid api key without admin scope
 */
export function createAdminAuth(
  apiKeyService: ApiKeyService,
  userRepo: UserRepository,
  logger: Logger,
): RequestHandler {
  return function adminAuth(req: Request, res: Response, next: NextFunction): void {
    if (req.session?.userId) {
      const user = userRepo.findById(req.session.userId);
      if (user) {
        req.authUser = user;
        next();
        return;
      }
      req.session.destroy();
    }

    const provided = req.headers['x-api-key'];
    if (typeof provided !== 'string' || provided.length === 0) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const result = apiKeyService.verify(provided);
    if (!result.ok) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!result.apiKey.scopes.includes('admin')) {
      res.status(403).json({ error: 'Forbidden', required_scope: 'admin' });
      return;
    }

    req.apiKey = result.apiKey;
    try {
      apiKeyService.touchLastUsed(result.apiKey.id);
    } catch (err) {
      logger.warn({ err, keyId: result.apiKey.id }, 'Failed to update last_used_at');
    }
    next();
  };
}
