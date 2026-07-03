import type { AliasDTO } from '../../contracts';
import type { AliasRow } from '../../db/schema';

export function serializeAlias(row: AliasRow): AliasDTO {
  return {
    id: row.id,
    address: row.address,
    target: row.target,
    domainId: row.domainId,
    source: row.source,
    notes: row.notes,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
