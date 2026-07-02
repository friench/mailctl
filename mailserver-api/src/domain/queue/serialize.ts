import type { SendJobDTO, SendJobSummaryDTO } from '../../contracts';
import type { SendJobRow } from '../../db/schema';

/** Full send-job DTO used by the /jobs endpoints. */
export function serializeSendJob(row: SendJobRow): SendJobDTO {
  return {
    id: row.id,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    payload: row.payload,
    account: row.accountUsed,
    messageId: row.messageId,
    error: row.lastError,
    apiKeyId: row.apiKeyId,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    nextAttemptAt: row.nextAttemptAt.toISOString(),
  };
}

/** Trimmed send-job DTO returned inline by the /send endpoint. */
export function serializeSendJobSummary(row: SendJobRow): SendJobSummaryDTO {
  return {
    id: row.id,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    account: row.accountUsed,
    messageId: row.messageId,
    error: row.lastError,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}
