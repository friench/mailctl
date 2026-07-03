import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { UserRepository } from '../../domain/users/repository';
import { FULL_ACCESS, type Authz } from '../../lib/authz';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Paths (relative to the /admin/api mount) whose resources are domain-scoped.
const DOMAIN_SCOPED = ['/domains', '/mailboxes', '/aliases'];
// Non-sensitive UI bootstrap available to any authenticated role.
const ALWAYS_ALLOWED = ['/settings'];

function matches(path: string, prefixes: string[]): boolean {
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

function authzForUser(role: string, userId: string, userRepo: UserRepository): Authz {
  switch (role) {
    case 'admin':
      return FULL_ACCESS;
    case 'read_only':
      return { scope: 'all', canWrite: false, canAccessGlobal: true };
    case 'domain_admin':
      return {
        scope: new Set(userRepo.listDomainIds(userId)),
        canWrite: true,
        canAccessGlobal: false,
      };
    case 'domain_read_only':
      return {
        scope: new Set(userRepo.listDomainIds(userId)),
        canWrite: false,
        canAccessGlobal: false,
      };
    default: // domain_user (self-service; no admin API access yet)
      return { scope: new Set(), canWrite: false, canAccessGlobal: false };
  }
}

/**
 * RBAC enforcement for `/admin/api`, after {@link createAdminAuth}. Computes the
 * actor's {@link Authz} (attached as `req.authz`) and gates:
 *  - global (non-domain) resources → require `canAccessGlobal`;
 *  - mutating methods → require `canWrite`.
 * Per-resource domain membership is enforced by the domain-scoped routes using
 * `req.authz`.
 */
export function createRbacGuard(userRepo: UserRepository): RequestHandler {
  return function rbacGuard(req: Request, res: Response, next: NextFunction): void {
    const authz: Authz = req.apiKey
      ? FULL_ACCESS
      : req.authUser
        ? authzForUser(req.authUser.role, req.authUser.id, userRepo)
        : { scope: new Set(), canWrite: false, canAccessGlobal: false };
    req.authz = authz;

    const path = req.path;
    const isWrite = !SAFE_METHODS.has(req.method);

    if (matches(path, ALWAYS_ALLOWED)) {
      if (isWrite && !authz.canWrite) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      next();
      return;
    }

    if (!matches(path, DOMAIN_SCOPED) && !authz.canAccessGlobal) {
      res.status(403).json({ error: 'Forbidden: not permitted for this role' });
      return;
    }
    if (isWrite && !authz.canWrite) {
      res.status(403).json({ error: 'Forbidden: read-only role' });
      return;
    }
    next();
  };
}
