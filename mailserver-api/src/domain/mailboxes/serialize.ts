import type { MailboxDTO } from '../../contracts';
import type { MailboxRow } from '../../db/schema';

export function serializeMailbox(row: MailboxRow): MailboxDTO {
  return {
    id: row.id,
    address: row.address,
    domainId: row.domainId,
    quotaMb: row.quotaMb,
    active: row.active,
    sendBlocked: row.sendBlocked,
    receiveBlocked: row.receiveBlocked,
    source: row.source,
    externallyManaged: row.externallyManaged,
    notes: row.notes,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
