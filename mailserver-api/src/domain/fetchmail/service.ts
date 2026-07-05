import { BusinessError } from '../../lib/errors';
import type { Logger } from '../../logger';
import type { SecretBox } from '../../lib/secret-box';
import { renderFetchmailConfig, type FetchmailAccountInput } from '../../lib/fetchmail';
import type { FetchmailAccountRow, FetchmailProtocol } from '../../db/schema';
import type { MailboxRepository } from '../mailboxes/repository';
import type { DmsClient } from '../mailboxes/dms-client';
import type { FetchmailRepository } from './repository';

export interface CreateFetchmail {
  pollServer: string;
  protocol: FetchmailProtocol;
  port?: number | null;
  username: string;
  password: string;
  destAddress: string;
  ssl?: boolean;
  keep?: boolean;
  active?: boolean;
}

/**
 * Manages recurring inbound-fetch (fetchmail) accounts and reflects them into
 * docker-mailserver. Every mutation regenerates `fetchmail.cf` from all active
 * accounts (decrypting their passwords) and writes it into DMS. Requires
 * `ENABLE_FETCHMAIL=1` in the mailserver for the daemon to run.
 */
export class FetchmailService {
  constructor(
    private readonly repo: FetchmailRepository,
    private readonly mailboxRepo: MailboxRepository,
    private readonly dms: DmsClient,
    private readonly secretBox: SecretBox,
    private readonly logger: Logger,
  ) {}

  list(): FetchmailAccountRow[] {
    return this.repo.list();
  }

  async create(input: CreateFetchmail): Promise<FetchmailAccountRow> {
    const destAddress = input.destAddress.trim().toLowerCase();
    if (!this.mailboxRepo.findByAddress(destAddress)) {
      throw new BusinessError(400, `No local mailbox for ${destAddress}`);
    }
    if (!input.password) throw new BusinessError(400, 'Password is required');

    const row = this.repo.create({
      pollServer: input.pollServer.trim(),
      protocol: input.protocol,
      port: input.port ?? null,
      username: input.username.trim(),
      passwordEnc: this.secretBox.encrypt(input.password),
      destAddress,
      ssl: input.ssl,
      keep: input.keep,
      active: input.active,
    });
    await this.regenerate();
    return row;
  }

  async setActive(id: string, active: boolean): Promise<FetchmailAccountRow> {
    const row = this.repo.setActive(id, active);
    if (!row) throw new BusinessError(404, 'Account not found');
    await this.regenerate();
    return row;
  }

  async delete(id: string): Promise<void> {
    if (!this.repo.delete(id)) throw new BusinessError(404, 'Account not found');
    await this.regenerate();
  }

  /** Re-render fetchmail.cf from all active accounts and write it into DMS. */
  async regenerate(): Promise<void> {
    const active: FetchmailAccountInput[] = [];
    for (const row of this.repo.list()) {
      if (!row.active) continue;
      try {
        active.push({
          pollServer: row.pollServer,
          protocol: row.protocol,
          port: row.port,
          username: row.username,
          password: this.secretBox.decrypt(row.passwordEnc),
          destAddress: row.destAddress,
          ssl: row.ssl,
          keep: row.keep,
        });
      } catch (err) {
        this.logger.error({ err, id: row.id }, 'fetchmail: could not decrypt password; skipping');
      }
    }
    await this.dms.writeFetchmailConfig(renderFetchmailConfig(active));
    this.logger.info({ count: active.length }, 'fetchmail config regenerated');
  }
}
