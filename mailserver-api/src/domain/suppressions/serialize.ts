import type { SuppressionDTO } from '../../contracts';
import type { SuppressionRow } from '../../db/schema';

export function serializeSuppression(row: SuppressionRow): SuppressionDTO {
  return {
    id: row.id,
    address: row.address,
    reason: row.reason,
    source: row.source,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}
