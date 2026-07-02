import type { Request, Response, NextFunction } from 'express';

/** Requires that the authenticated `req.apiKey` includes the given scope. */
export function requireScope(scope: string) {
  return function scopeGuard(req: Request, res: Response, next: NextFunction): void {
    if (!req.apiKey) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!req.apiKey.scopes.includes(scope)) {
      res.status(403).json({ error: 'Forbidden', required_scope: scope });
      return;
    }
    next();
  };
}
