import { BusinessError } from './errors';

/** Set of domain IDs the actor may touch, or `all` for global roles / API keys. */
export type DomainScope = 'all' | ReadonlySet<string>;

export interface Authz {
  scope: DomainScope;
  /** May perform mutating operations (admin / domain_admin). */
  canWrite: boolean;
  /** May access global (non-domain) admin resources (admin / read_only / API key). */
  canAccessGlobal: boolean;
}

export const FULL_ACCESS: Authz = { scope: 'all', canWrite: true, canAccessGlobal: true };

/** True when the actor's scope covers the given domain. */
export function inScope(authz: Authz, domainId: string | null | undefined): boolean {
  if (authz.scope === 'all') return true;
  return domainId != null && authz.scope.has(domainId);
}

/** Throw a 404 when the domain is outside the actor's scope (hides existence). */
export function assertInScope(authz: Authz, domainId: string | null | undefined): void {
  if (!inScope(authz, domainId)) {
    throw new BusinessError(404, 'Not found');
  }
}

/** Filter rows keyed by their own id (domains). */
export function scopeById<T extends { id: string }>(authz: Authz, rows: T[]): T[] {
  if (authz.scope === 'all') return rows;
  return rows.filter((r) => inScope(authz, r.id));
}

/** Filter rows keyed by `domainId` (mailboxes, aliases). */
export function scopeByDomainId<T extends { domainId: string | null }>(
  authz: Authz,
  rows: T[],
): T[] {
  if (authz.scope === 'all') return rows;
  return rows.filter((r) => inScope(authz, r.domainId));
}
