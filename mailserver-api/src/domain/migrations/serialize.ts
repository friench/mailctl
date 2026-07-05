import type { MigrationJobDTO, MigrationJobDetailDTO } from '../../contracts';
import type { MigrationJobRow } from '../../db/schema';

/** Serialize a migration job WITHOUT the source password (never exposed). */
export function serializeMigration(row: MigrationJobRow): MigrationJobDTO {
  return {
    id: row.id,
    sourceHost: row.sourceHost,
    sourcePort: row.sourcePort,
    sourceUser: row.sourceUser,
    sourceSsl: row.sourceSsl,
    destAddress: row.destAddress,
    status: row.status,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

export function serializeMigrationDetail(row: MigrationJobRow): MigrationJobDetailDTO {
  return { ...serializeMigration(row), log: row.log };
}
