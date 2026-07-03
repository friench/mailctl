import type { Request, Response, NextFunction, RequestHandler } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * RBAC enforcement for `/admin/api`, applied after {@link createAdminAuth}.
 *
 * B2.1 enforces the global roles:
 *  - `admin`      — full access (also the effective role of admin-scoped API keys).
 *  - `read_only`  — safe (GET/HEAD) methods only.
 *
 * Domain-scoped roles (`domain_admin`, `domain_read_only`, `domain_user`) are
 * denied until per-domain scoping lands, so there is no privilege escalation in
 * the meantime.
 */
export function createRbacGuard(): RequestHandler {
  return function rbacGuard(req: Request, res: Response, next: NextFunction): void {
    // Admin-scoped API keys already passed the scope check in adminAuth.
    if (req.apiKey) {
      next();
      return;
    }

    const role = req.authUser?.role;
    if (!role || role === 'admin') {
      next();
      return;
    }

    if (role === 'read_only') {
      if (SAFE_METHODS.has(req.method)) {
        next();
        return;
      }
      res.status(403).json({ error: 'Forbidden: read-only role' });
      return;
    }

    res.status(403).json({ error: 'Forbidden: role not permitted here' });
  };
}
