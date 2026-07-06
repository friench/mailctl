import type { MinTlsVersion, SmtpAccountRow } from '../../db/schema';
import type { SmtpAccountRepository } from './repository';

/**
 * SMTP account row enriched with credentials resolved from env vars
 * and a constructed RFC-5322 from-string.
 */
export interface ResolvedSmtpAccount {
  id: string;
  name: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromAddress: string;
  fromName: string | null;
  /** Constructed: `"Name" <addr>` if fromName, else just `addr`. */
  from: string;
  priority: number;
  /** Per-account TLS policy. */
  requireTls: boolean;
  /** null → inherit the global SMTP_TLS_REJECT_UNAUTHORIZED default. */
  rejectUnauthorized: boolean | null;
  minTlsVersion: MinTlsVersion | null;
}

export class SmtpAccountLoader {
  constructor(
    private readonly repo: SmtpAccountRepository,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  loadActive(): ResolvedSmtpAccount[] {
    return this.repo.listActive().map((row) => this.resolve(row));
  }

  resolve(row: SmtpAccountRow): ResolvedSmtpAccount {
    const user = row.userEnvVar ? (this.env[row.userEnvVar] ?? '') : '';
    const password = row.passwordEnvVar ? (this.env[row.passwordEnvVar] ?? '') : '';
    const from = row.fromName ? `"${row.fromName}" <${row.fromAddress}>` : row.fromAddress;

    return {
      id: row.id,
      name: row.name,
      host: row.host,
      port: row.port,
      secure: row.secure,
      user,
      password,
      fromAddress: row.fromAddress,
      fromName: row.fromName,
      from,
      priority: row.priority,
      requireTls: row.requireTls,
      rejectUnauthorized: row.rejectUnauthorized,
      minTlsVersion: row.minTlsVersion,
    };
  }
}
