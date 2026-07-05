import { BusinessError } from '../../lib/errors';
import type { Logger } from '../../logger';
import type { SecretBox } from '../../lib/secret-box';
import type { ImapSslMode, MigrationJobRow } from '../../db/schema';
import type { MailboxRepository } from '../mailboxes/repository';
import type { Migrator } from './migrator';
import type { MigrationJobRepository } from './repository';

export interface CreateMigration {
  sourceHost: string;
  sourcePort?: number;
  sourceUser: string;
  sourcePassword: string;
  sourceSsl: ImapSslMode;
  destAddress: string;
}

function defaultPort(ssl: ImapSslMode): number {
  return ssl === 'imaps' ? 993 : 143;
}

/**
 * One-shot IMAP migration jobs. Jobs are queued and processed serially by the
 * MigrationWorker via {@link processOne}; each pulls a remote mailbox into a
 * local address through Dovecot dsync. The source password is stored encrypted
 * and wiped once the job finishes.
 */
export class MigrationService {
  constructor(
    private readonly repo: MigrationJobRepository,
    private readonly migrator: Migrator,
    private readonly mailboxRepo: MailboxRepository,
    private readonly secretBox: SecretBox,
    private readonly logger: Logger,
  ) {}

  create(input: CreateMigration): MigrationJobRow {
    const destAddress = input.destAddress.trim().toLowerCase();
    if (!this.mailboxRepo.findByAddress(destAddress)) {
      throw new BusinessError(400, `No local mailbox for ${destAddress}`);
    }
    if (!input.sourcePassword) throw new BusinessError(400, 'Source password is required');

    return this.repo.create({
      sourceHost: input.sourceHost.trim(),
      sourcePort: input.sourcePort ?? defaultPort(input.sourceSsl),
      sourceUser: input.sourceUser.trim(),
      sourceSsl: input.sourceSsl,
      sourcePasswordEnc: this.secretBox.encrypt(input.sourcePassword),
      destAddress,
    });
  }

  list(): MigrationJobRow[] {
    return this.repo.list();
  }

  findById(id: string): MigrationJobRow | undefined {
    return this.repo.findById(id);
  }

  delete(id: string): void {
    const row = this.repo.findById(id);
    if (!row) throw new BusinessError(404, 'Migration not found');
    if (row.status === 'processing') {
      throw new BusinessError(409, 'Cannot delete a running migration');
    }
    this.repo.delete(id);
  }

  /** Worker tick: claim and run the next pending job. Returns true if work was done. */
  async processOne(): Promise<boolean> {
    const job = this.repo.claimNextPending();
    if (!job) return false;

    if (!job.sourcePasswordEnc) {
      this.repo.finish(job.id, 'failed', { log: '', error: 'Missing source credentials' });
      return true;
    }

    let password: string;
    try {
      password = this.secretBox.decrypt(job.sourcePasswordEnc);
    } catch (err) {
      this.logger.error({ err, id: job.id }, 'migration: failed to decrypt source password');
      this.repo.finish(job.id, 'failed', {
        log: '',
        error: 'Could not decrypt source credentials',
      });
      return true;
    }

    const result = await this.migrator.run({
      sourceHost: job.sourceHost,
      sourcePort: job.sourcePort,
      sourceUser: job.sourceUser,
      sourcePassword: password,
      sourceSsl: job.sourceSsl,
      destAddress: job.destAddress,
    });

    this.repo.finish(job.id, result.ok ? 'done' : 'failed', {
      log: result.log,
      error: result.ok ? null : 'IMAP sync failed — see log',
    });
    this.logger.info({ id: job.id, dest: job.destAddress, ok: result.ok }, 'migration finished');
    return true;
  }

  /** Run on startup: requeue jobs left 'processing' by a crashed worker. */
  recoverStuckJobs(): number {
    const count = this.repo.resetProcessingToPending();
    if (count > 0) this.logger.warn({ count }, 'Recovered stuck migration jobs');
    return count;
  }
}
