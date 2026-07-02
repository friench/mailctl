import type { SmtpAccountDTO } from '../../contracts';
import type { SmtpAccountRow } from '../../db/schema';

export function serializeSmtpAccount(row: SmtpAccountRow): SmtpAccountDTO {
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    secure: row.secure,
    userEnvVar: row.userEnvVar,
    passwordEnvVar: row.passwordEnvVar,
    fromAddress: row.fromAddress,
    fromName: row.fromName,
    priority: row.priority,
    active: row.active,
    domainId: row.domainId,
    createdAt: row.createdAt.toISOString(),
  };
}
