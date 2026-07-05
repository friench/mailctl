import { BusinessError } from '../../lib/errors';
import type { Logger } from '../../logger';
import type { DomainService } from '../domains/service';
import type { DomainRepository } from '../domains/repository';
import type { MailboxService } from '../mailboxes/service';
import type { MailboxRepository } from '../mailboxes/repository';
import type { AliasService } from '../aliases/service';
import type { AliasRepository } from '../aliases/repository';

export interface ImportDomain {
  name: string;
  dkimSelector?: string | null;
}
export interface ImportMailbox {
  address: string;
  password?: string;
  quotaMb?: number;
  notes?: string | null;
}
export interface ImportAlias {
  address: string;
  target: string;
  notes?: string | null;
}

export interface ImportDocument {
  domains?: ImportDomain[];
  mailboxes?: ImportMailbox[];
  aliases?: ImportAlias[];
}

export type ImportAction = 'created' | 'skipped' | 'failed';

export interface ImportItemResult {
  key: string;
  action: ImportAction;
  error?: string;
}

export interface ImportResult {
  dryRun: boolean;
  domains: ImportItemResult[];
  mailboxes: ImportItemResult[];
  aliases: ImportItemResult[];
  summary: { created: number; skipped: number; failed: number };
}

/**
 * Idempotent bulk provisioning from a JSON document. Processes domains →
 * mailboxes → aliases (dependency order); an entity that already exists is
 * skipped (never mutated), so re-running the same document is safe. Each item is
 * applied independently and reported (`created`/`skipped`/`failed`); a failure
 * never aborts the rest. `dryRun` reports the plan without touching anything.
 */
export class ImportService {
  constructor(
    private readonly domainService: DomainService,
    private readonly domainRepo: DomainRepository,
    private readonly mailboxService: MailboxService,
    private readonly mailboxRepo: MailboxRepository,
    private readonly aliasService: AliasService,
    private readonly aliasRepo: AliasRepository,
    private readonly logger: Logger,
  ) {}

  async run(doc: ImportDocument, opts: { dryRun?: boolean } = {}): Promise<ImportResult> {
    const dryRun = opts.dryRun ?? false;
    const result: ImportResult = {
      dryRun,
      domains: [],
      mailboxes: [],
      aliases: [],
      summary: { created: 0, skipped: 0, failed: 0 },
    };

    for (const d of doc.domains ?? []) {
      result.domains.push(
        await this.apply(
          d.name,
          dryRun,
          () => !!this.domainRepo.findByName(d.name.trim()),
          () =>
            this.domainService.create({
              name: d.name.trim(),
              dkimSelector: d.dkimSelector ?? null,
            }),
        ),
      );
    }

    for (const m of doc.mailboxes ?? []) {
      const address = m.address.trim().toLowerCase();
      result.mailboxes.push(
        await this.apply(
          address,
          dryRun,
          () => !!this.mailboxRepo.findByAddress(address),
          () =>
            this.mailboxService.create({
              address,
              password: m.password!,
              quotaMb: m.quotaMb,
              notes: m.notes ?? null,
            }),
          () => {
            if (!m.password) throw new BusinessError(400, 'Password required for a new mailbox');
          },
        ),
      );
    }

    for (const a of doc.aliases ?? []) {
      const address = a.address.trim().toLowerCase();
      result.aliases.push(
        await this.apply(
          address,
          dryRun,
          () => !!this.aliasRepo.findByAddress(address),
          () =>
            this.aliasService.create({ address, target: a.target.trim(), notes: a.notes ?? null }),
        ),
      );
    }

    for (const list of [result.domains, result.mailboxes, result.aliases]) {
      for (const item of list) result.summary[item.action] += 1;
    }
    this.logger.info({ dryRun, summary: result.summary }, 'Bulk import completed');
    return result;
  }

  /**
   * Apply one item: skip when it exists, otherwise create (unless dry-run).
   * `validate` (when given) runs in BOTH modes so a dry-run surfaces the same
   * validation failures a real run would hit.
   */
  private async apply(
    key: string,
    dryRun: boolean,
    exists: () => boolean,
    create: () => Promise<unknown>,
    validate?: () => void,
  ): Promise<ImportItemResult> {
    try {
      if (exists()) return { key, action: 'skipped' };
      validate?.();
      if (!dryRun) await create();
      return { key, action: 'created' };
    } catch (err) {
      return { key, action: 'failed', error: err instanceof Error ? err.message : String(err) };
    }
  }
}
