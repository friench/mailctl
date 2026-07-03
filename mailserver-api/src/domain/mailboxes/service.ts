import { BusinessError } from '../../lib/errors';
import { domainOf } from '../../lib/address';
import type { DomainRepository } from '../domains/repository';
import type { DomainRow, MailboxRow } from '../../db/schema';
import type { EventDispatcher } from '../events/types';
import { NOOP_DISPATCHER } from '../events/types';
import type { PasswordValidator } from '../../lib/password-policy';
import type { DmsClient } from './dms-client';
import type { MailboxRepository } from './repository';

export interface CreateMailboxInput {
  address: string;
  password: string;
  quotaMb?: number;
  notes?: string | null;
}

export interface UpdateMailboxInput {
  quotaMb?: number | null;
  active?: boolean;
  sendBlocked?: boolean;
  receiveBlocked?: boolean;
  notes?: string | null;
}

export class MailboxService {
  constructor(
    private readonly repo: MailboxRepository,
    private readonly domainRepo: DomainRepository,
    private readonly dms: DmsClient,
    private readonly events: EventDispatcher = NOOP_DISPATCHER,
    private readonly passwordValidator?: PasswordValidator,
  ) {}

  /** Enforce the password policy (strength + breached check) when a validator is configured. */
  private async assertPasswordAcceptable(password: string): Promise<void> {
    if (!this.passwordValidator) return;
    const error = await this.passwordValidator.validate(password);
    if (error) throw new BusinessError(400, error, 'WEAK_PASSWORD');
  }

  list(): MailboxRow[] {
    return this.repo.list();
  }

  findById(id: string): MailboxRow | undefined {
    return this.repo.findById(id);
  }

  findByAddress(address: string): MailboxRow | undefined {
    return this.repo.findByAddress(address.toLowerCase());
  }

  async create(input: CreateMailboxInput): Promise<MailboxRow> {
    const address = input.address.toLowerCase();
    const domain = this.findDomainForAddress(address);
    if (!domain) {
      throw new BusinessError(
        400,
        `Domain "${domainOf(address)}" is not registered`,
        'DOMAIN_NOT_FOUND',
      );
    }
    if (!domain.active) {
      throw new BusinessError(400, `Domain "${domain.name}" is disabled`, 'DOMAIN_DISABLED');
    }

    const existing = this.repo.findByAddress(address);
    if (existing) {
      throw new BusinessError(409, `Mailbox "${address}" already exists`, 'MAILBOX_EXISTS');
    }

    await this.assertPasswordAcceptable(input.password);
    await this.dms.addEmail(address, input.password);

    if (input.quotaMb !== undefined) {
      try {
        await this.dms.setQuota(address, input.quotaMb);
      } catch (err) {
        // Roll back the just-created mailbox so DMS state stays consistent.
        await this.dms.deleteEmail(address).catch(() => undefined);
        throw err;
      }
    }

    const created = this.repo.create({
      address,
      domainId: domain.id,
      quotaMb: input.quotaMb ?? null,
      active: true,
      notes: input.notes ?? null,
    });
    this.events.dispatch('mailbox.created', {
      mailboxId: created.id,
      address: created.address,
      domainId: domain.id,
      quotaMb: created.quotaMb,
    });
    return created;
  }

  async delete(id: string): Promise<void> {
    const row = this.repo.findById(id);
    if (!row) throw new BusinessError(404, 'Mailbox not found');

    // Clear any restrictions first so a later mailbox at the same address is not
    // stale-blocked (restrictions live in Postfix maps, independent of the account).
    if (row.sendBlocked) await this.dms.setSendRestricted(row.address, false);
    if (row.receiveBlocked) await this.dms.setReceiveRestricted(row.address, false);

    await this.dms.deleteEmail(row.address);
    this.repo.delete(id);
    this.events.dispatch('mailbox.deleted', {
      mailboxId: row.id,
      address: row.address,
      domainId: row.domainId,
    });
  }

  async updatePassword(id: string, password: string): Promise<void> {
    const row = this.repo.findById(id);
    if (!row) throw new BusinessError(404, 'Mailbox not found');

    await this.assertPasswordAcceptable(password);
    await this.dms.updatePassword(row.address, password);
  }

  async update(id: string, input: UpdateMailboxInput): Promise<MailboxRow> {
    const row = this.repo.findById(id);
    if (!row) throw new BusinessError(404, 'Mailbox not found');

    if (input.quotaMb !== undefined && input.quotaMb !== row.quotaMb) {
      if (input.quotaMb === null) {
        await this.dms.deleteQuota(row.address);
      } else {
        await this.dms.setQuota(row.address, input.quotaMb);
      }
    }

    // Reflect send/receive blocks into docker-mailserver only when they change.
    if (input.sendBlocked !== undefined && input.sendBlocked !== row.sendBlocked) {
      await this.dms.setSendRestricted(row.address, input.sendBlocked);
    }
    if (input.receiveBlocked !== undefined && input.receiveBlocked !== row.receiveBlocked) {
      await this.dms.setReceiveRestricted(row.address, input.receiveBlocked);
    }

    const updated = this.repo.update(id, input);
    if (!updated) throw new BusinessError(404, 'Mailbox not found');
    return updated;
  }

  private findDomainForAddress(address: string): DomainRow | undefined {
    const part = domainOf(address);
    if (!part) return undefined;
    return this.domainRepo.findByName(part);
  }
}
