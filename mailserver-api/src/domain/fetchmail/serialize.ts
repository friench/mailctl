import type { FetchmailAccountDTO } from '../../contracts';
import type { FetchmailAccountRow } from '../../db/schema';

/** Serialize a fetchmail account WITHOUT the password (never exposed). */
export function serializeFetchmail(row: FetchmailAccountRow): FetchmailAccountDTO {
  return {
    id: row.id,
    pollServer: row.pollServer,
    protocol: row.protocol,
    port: row.port,
    username: row.username,
    destAddress: row.destAddress,
    ssl: row.ssl,
    keep: row.keep,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}
