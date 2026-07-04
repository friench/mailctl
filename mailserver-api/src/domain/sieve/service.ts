import { BusinessError } from '../../lib/errors';
import { buildSieveScript, type SieveConfig } from '../../lib/sieve';
import type { MailboxRepository } from '../mailboxes/repository';
import type { DmsClient } from '../mailboxes/dms-client';
import type { SieveRepository } from './repository';

const DEFAULT_CONFIG: SieveConfig = {
  vacation: { enabled: false, subject: '', message: '', days: 7 },
  rules: [],
};

/** Manages per-mailbox Sieve config (vacation + filter rules), reflected into DMS. */
export class SieveService {
  constructor(
    private readonly repo: SieveRepository,
    private readonly mailboxRepo: MailboxRepository,
    private readonly dms: DmsClient,
  ) {}

  get(mailboxId: string): SieveConfig {
    if (!this.mailboxRepo.findById(mailboxId)) throw new BusinessError(404, 'Mailbox not found');
    const row = this.repo.get(mailboxId);
    if (!row) return DEFAULT_CONFIG;
    return {
      vacation: {
        enabled: row.vacationEnabled,
        subject: row.vacationSubject ?? '',
        message: row.vacationMessage ?? '',
        days: row.vacationDays,
      },
      rules: row.rules,
    };
  }

  async set(mailboxId: string, config: SieveConfig): Promise<SieveConfig> {
    const mailbox = this.mailboxRepo.findById(mailboxId);
    if (!mailbox) throw new BusinessError(404, 'Mailbox not found');

    this.repo.upsert(mailboxId, {
      vacationEnabled: config.vacation.enabled,
      vacationSubject: config.vacation.subject || null,
      vacationMessage: config.vacation.message || null,
      vacationDays: config.vacation.days,
      rules: config.rules,
    });

    await this.dms.writeSieve(mailbox.address, buildSieveScript(config));
    return config;
  }
}
