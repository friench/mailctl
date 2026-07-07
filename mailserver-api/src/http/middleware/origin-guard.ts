import type { Request, Response, NextFunction } from 'express';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF defense-in-depth for cookie-authenticated admin mutations. The session
 * cookie is already SameSite=lax, which blocks it on cross-site non-GET
 * requests; this rejects any state-changing request whose Origin header does
 * not match the served host as a second layer.
 *
 * Skipped for:
 *  - safe methods (GET/HEAD/OPTIONS),
 *  - API-key requests (X-Api-Key auth is not CSRF-able and clients omit Origin),
 *  - requests with no Origin header (non-browser clients; SameSite covers browsers).
 */
export function createOriginGuard(opts: { trustedOrigins?: string[] } = {}) {
  const trusted = new Set(opts.trustedOrigins ?? []);

  return function originGuard(req: Request, res: Response, next: NextFunction): void {
    if (!MUTATING_METHODS.has(req.method)) return next();
    if (req.headers['x-api-key']) return next();

    const origin = req.headers.origin;
    if (!origin) return next();

    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      res.status(403).json({ error: 'Cross-origin request rejected' });
      return;
    }

    if (originHost === req.headers.host || trusted.has(origin) || trusted.has(originHost)) {
      return next();
    }
    res.status(403).json({ error: 'Cross-origin request rejected' });
  };
}
