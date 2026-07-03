import type { DomainDTO } from '../../contracts';
import type { DomainRow } from '../../db/schema';

export function serializeDomain(row: DomainRow): DomainDTO {
  return {
    id: row.id,
    name: row.name,
    dkimSelector: row.dkimSelector,
    dkimPublicKey: row.dkimPublicKey,
    active: row.active,
    source: row.source,
    dkimStatus: row.dkimStatus,
    notes: row.notes,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
