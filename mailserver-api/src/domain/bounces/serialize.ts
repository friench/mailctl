import type { BounceEventDTO } from '../../contracts';
import type { BounceEventRow } from '../../db/schema';

export function serializeBounce(row: BounceEventRow): BounceEventDTO {
  return {
    id: row.id,
    sendJobId: row.sendJobId,
    recipient: row.recipient,
    type: row.type,
    classification: row.classification,
    statusCode: row.statusCode,
    diagnostic: row.diagnostic,
    originalMessageId: row.originalMessageId,
    createdAt: row.createdAt.toISOString(),
  };
}
