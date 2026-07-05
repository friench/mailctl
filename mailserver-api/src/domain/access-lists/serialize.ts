import type { AccessRuleDTO } from '../../contracts';
import type { AccessRuleRow } from '../../db/schema';

export function serializeAccessRule(row: AccessRuleRow): AccessRuleDTO {
  return {
    id: row.id,
    matchType: row.matchType,
    action: row.action,
    value: row.value,
    recipient: row.recipient,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}
