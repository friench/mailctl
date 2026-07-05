import { BusinessError } from '../../lib/errors';
import type { Logger } from '../../logger';
import type { MailboxRow } from '../../db/schema';
import type { MailboxRepository } from '../mailboxes/repository';
import type { DmsClient, JunkMessage } from '../mailboxes/dms-client';

export type QuarantineAction = 'release' | 'delete';

/** A mailbox and the spam messages currently held in its Junk folder. */
export interface QuarantineBox {
  mailboxId: string;
  address: string;
  domainId: string | null;
  messages: JunkMessage[];
}

/**
 * Spam quarantine management. Spam is filed by the engine (Rspamd/SpamAssassin)
 * into each mailbox's Junk folder; this service inspects it and releases
 * (Junk → INBOX) or deletes it, per mailbox, via {@link DmsClient} (doveadm).
 * Domain scoping is enforced by callers passing pre-scoped mailbox rows.
 */
export class QuarantineService {
  constructor(
    private readonly mailboxRepo: MailboxRepository,
    private readonly dms: DmsClient,
    private readonly logger: Logger,
  ) {}

  private mailboxOrThrow(mailboxId: string): MailboxRow {
    const mb = this.mailboxRepo.findById(mailboxId);
    if (!mb) throw new BusinessError(404, 'Mailbox not found');
    return mb;
  }

  async listForMailbox(mailboxId: string): Promise<QuarantineBox> {
    const mb = this.mailboxOrThrow(mailboxId);
    const messages = await this.dms.listJunk(mb.address);
    return { mailboxId: mb.id, address: mb.address, domainId: mb.domainId, messages };
  }

  /** Aggregate the quarantine across the given (already-scoped) mailboxes. */
  async listForMailboxes(rows: MailboxRow[]): Promise<QuarantineBox[]> {
    const boxes: QuarantineBox[] = [];
    for (const mb of rows) {
      try {
        const messages = await this.dms.listJunk(mb.address);
        boxes.push({ mailboxId: mb.id, address: mb.address, domainId: mb.domainId, messages });
      } catch (err) {
        this.logger.warn({ address: mb.address, err }, 'quarantine: list failed for mailbox');
      }
    }
    return boxes;
  }

  async getMessage(mailboxId: string, uid: number): Promise<string> {
    const mb = this.mailboxOrThrow(mailboxId);
    return this.dms.readJunkMessage(mb.address, uid);
  }

  async release(mailboxId: string, uid: number): Promise<void> {
    const mb = this.mailboxOrThrow(mailboxId);
    await this.dms.releaseJunk(mb.address, uid);
  }

  async remove(mailboxId: string, uid: number): Promise<void> {
    const mb = this.mailboxOrThrow(mailboxId);
    await this.dms.deleteJunk(mb.address, uid);
  }

  /** Apply a bulk action to a set of UIDs in one mailbox; returns the count handled. */
  async bulk(mailboxId: string, uids: number[], action: QuarantineAction): Promise<number> {
    const mb = this.mailboxOrThrow(mailboxId);
    let handled = 0;
    for (const uid of uids) {
      if (action === 'release') await this.dms.releaseJunk(mb.address, uid);
      else await this.dms.deleteJunk(mb.address, uid);
      handled += 1;
    }
    return handled;
  }

  /** Expunge Junk older than `days` across the given mailboxes; returns total removed. */
  async purge(rows: MailboxRow[], days: number): Promise<number> {
    let total = 0;
    for (const mb of rows) {
      try {
        total += await this.dms.purgeJunkOlderThan(mb.address, days);
      } catch (err) {
        this.logger.warn({ address: mb.address, err }, 'quarantine: purge failed for mailbox');
      }
    }
    return total;
  }
}
