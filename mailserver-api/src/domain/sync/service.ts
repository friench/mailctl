import type { Logger } from '../../logger';
import type { DomainRepository } from '../domains/repository';
import type { MailboxRepository } from '../mailboxes/repository';
import type { AliasRepository } from '../aliases/repository';
import type { DmsClient } from '../mailboxes/dms-client';
import { domainOf } from '../../lib/address';
import { diff } from './diff';
import type {
  ApplyItemResult,
  DbState,
  DmsState,
  ReconciliationItem,
  ResolutionRequest,
  SyncRunSummary,
} from './types';

export interface ApplyOptions {
  confirmDeletes?: boolean;
}

export interface ApplyOutcome {
  results: ApplyItemResult[];
  summary: SyncRunSummary;
}

export class SyncService {
  private lastRun: SyncRunSummary | null = null;
  private running = false;

  constructor(
    private readonly dms: DmsClient,
    private readonly domainRepo: DomainRepository,
    private readonly mailboxRepo: MailboxRepository,
    private readonly aliasRepo: AliasRepository,
    private readonly logger: Logger,
  ) {}

  async readDmsState(): Promise<DmsState> {
    const [emails, quotas, aliases, dkim] = await Promise.all([
      this.dms.listEmails(),
      this.dms.listQuotas(),
      this.dms.listAliases(),
      this.dms.listDkim(),
    ]);
    const quotaByAddress = new Map(quotas.map((q) => [q.address.toLowerCase(), q.quotaMb]));

    const domainSet = new Set<string>();
    for (const e of emails) domainSet.add(domainOf(e.address));
    for (const a of aliases) domainSet.add(domainOf(a.address));
    for (const k of dkim) domainSet.add(k.domain.toLowerCase());
    domainSet.delete('');

    return {
      domains: [...domainSet],
      mailboxes: emails.map((e) => ({
        address: e.address.toLowerCase(),
        quotaMb: quotaByAddress.get(e.address.toLowerCase()) ?? null,
      })),
      aliases: aliases.map((a) => ({ address: a.address.toLowerCase(), target: a.target })),
      dkim: dkim.map((k) => ({ ...k, domain: k.domain.toLowerCase() })),
    };
  }

  readDbState(): DbState {
    return {
      domains: this.domainRepo.list().map((d) => ({
        name: d.name,
        dkimSelector: d.dkimSelector,
        dkimPublicKey: d.dkimPublicKey,
      })),
      mailboxes: this.mailboxRepo.list().map((m) => ({ address: m.address, quotaMb: m.quotaMb })),
      aliases: this.aliasRepo.list().map((a) => ({ address: a.address, target: a.target })),
    };
  }

  async preview(): Promise<{
    items: ReconciliationItem[];
    generatedAt: string;
    lastRun: SyncRunSummary | null;
  }> {
    const [dms, db] = [await this.readDmsState(), this.readDbState()];
    return { items: diff(dms, db), generatedAt: new Date().toISOString(), lastRun: this.lastRun };
  }

  status(): { lastRun: SyncRunSummary | null } {
    return { lastRun: this.lastRun };
  }

  /** Count of divergence items, used by the optional background notifier. */
  async divergenceCount(): Promise<number> {
    const [dms, db] = [await this.readDmsState(), this.readDbState()];
    return diff(dms, db).length;
  }

  async apply(resolutions: ResolutionRequest[], opts: ApplyOptions = {}): Promise<ApplyOutcome> {
    if (this.running) {
      throw new Error('A sync apply is already in progress');
    }
    this.running = true;
    try {
      const dms = await this.readDmsState();
      const db = this.readDbState();
      const items = diff(dms, db);
      const byKey = new Map(items.map((it) => [`${it.entityType}:${it.key}`, it]));

      const dmsMailQuota = new Map(dms.mailboxes.map((m) => [m.address, m.quotaMb]));
      const dmsAliasTarget = new Map(dms.aliases.map((a) => [a.address, a.target]));
      const dmsDkimByDomain = new Map(dms.dkim.map((k) => [k.domain, k]));

      const results: ApplyItemResult[] = [];
      for (const req of resolutions) {
        if (req.resolution === 'skip') continue;
        const base = { entityType: req.entityType, key: req.key, resolution: req.resolution };
        const item = byKey.get(`${req.entityType}:${req.key}`);

        if (!item) {
          results.push({
            ...base,
            status: 'rejected',
            error: 'Item no longer diverges (stale preview)',
          });
          continue;
        }
        if (item.stateHash !== req.stateHash) {
          results.push({
            ...base,
            status: 'rejected',
            error: 'State changed since preview — re-preview',
          });
          continue;
        }
        if (!item.availableResolutions.includes(req.resolution)) {
          results.push({
            ...base,
            status: 'rejected',
            error: `Resolution "${req.resolution}" not available for this item`,
          });
          continue;
        }
        if (
          (req.resolution === 'delete_db' || req.resolution === 'delete_dms') &&
          !opts.confirmDeletes
        ) {
          results.push({
            ...base,
            status: 'rejected',
            error: 'confirmDeletes is required for delete resolutions',
          });
          continue;
        }

        try {
          await this.applyOne(item, req, { dmsMailQuota, dmsAliasTarget, dmsDkimByDomain });
          this.logger.info({ ...base }, 'Sync resolution applied');
          results.push({ ...base, status: 'applied' });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn({ ...base, err: message }, 'Sync resolution failed');
          results.push({ ...base, status: 'failed', error: message });
        }
      }

      const summary: SyncRunSummary = {
        at: new Date().toISOString(),
        applied: results.filter((r) => r.status === 'applied').length,
        failed: results.filter((r) => r.status === 'failed').length,
        rejected: results.filter((r) => r.status === 'rejected').length,
      };
      this.lastRun = summary;
      return { results, summary };
    } finally {
      this.running = false;
    }
  }

  private ensureDomainRow(name: string): { id: string } {
    const existing = this.domainRepo.findByName(name);
    if (existing) return existing;
    return this.domainRepo.create({ name, source: 'dms', active: true });
  }

  private async applyOne(
    item: ReconciliationItem,
    req: ResolutionRequest,
    ctx: {
      dmsMailQuota: Map<string, number | null>;
      dmsAliasTarget: Map<string, string>;
      dmsDkimByDomain: Map<string, { domain: string; selector: string; publicKey: string }>;
    },
  ): Promise<void> {
    const key = item.key;

    if (item.entityType === 'domain') {
      if (req.resolution === 'import') {
        this.ensureDomainRow(key);
      } else if (req.resolution === 'delete_db') {
        const row = this.domainRepo.findByName(key);
        if (row) this.domainRepo.delete(row.id);
      }
      return;
    }

    if (item.entityType === 'mailbox') {
      if (req.resolution === 'import') {
        const domain = this.ensureDomainRow(domainOf(key));
        const existing = this.mailboxRepo.findByAddress(key);
        if (!existing) {
          this.mailboxRepo.create({
            address: key,
            domainId: domain.id,
            quotaMb: ctx.dmsMailQuota.get(key) ?? null,
            source: 'dms',
            externallyManaged: true,
          });
        }
      } else if (req.resolution === 'push') {
        if (!req.password) throw new Error('password is required to push a mailbox to DMS');
        const row = this.mailboxRepo.findByAddress(key);
        await this.dms.addEmail(key, req.password);
        if (row?.quotaMb != null) await this.dms.setQuota(key, row.quotaMb);
        if (row) this.mailboxRepo.touchSync(row.id);
      } else if (req.resolution === 'delete_dms') {
        await this.dms.deleteEmail(key);
      } else if (req.resolution === 'delete_db') {
        const row = this.mailboxRepo.findByAddress(key);
        if (row) this.mailboxRepo.delete(row.id);
      } else if (req.resolution === 'field_pick') {
        const dir = req.fields?.quota ?? 'dms';
        const row = this.mailboxRepo.findByAddress(key);
        if (dir === 'dms') {
          const quotaMb = ctx.dmsMailQuota.get(key) ?? null;
          if (row) this.mailboxRepo.update(row.id, { quotaMb });
        } else {
          const quotaMb = row?.quotaMb ?? null;
          if (quotaMb == null) await this.dms.deleteQuota(key);
          else await this.dms.setQuota(key, quotaMb);
        }
      }
      return;
    }

    if (item.entityType === 'alias') {
      if (req.resolution === 'import') {
        const domain = this.ensureDomainRow(domainOf(key));
        const target = ctx.dmsAliasTarget.get(key) ?? '';
        const existing = this.aliasRepo.findByAddress(key);
        if (!existing) {
          this.aliasRepo.create({ address: key, target, domainId: domain.id, source: 'dms' });
        }
      } else if (req.resolution === 'push') {
        const row = this.aliasRepo.findByAddress(key);
        if (row) await this.dms.addAlias(key, row.target);
      } else if (req.resolution === 'delete_dms') {
        await this.dms.deleteAlias(key, ctx.dmsAliasTarget.get(key) ?? '');
      } else if (req.resolution === 'delete_db') {
        const row = this.aliasRepo.findByAddress(key);
        if (row) this.aliasRepo.delete(row.id);
      } else if (req.resolution === 'field_pick') {
        const dir = req.fields?.target ?? 'dms';
        const row = this.aliasRepo.findByAddress(key);
        if (dir === 'dms') {
          if (row)
            this.aliasRepo.update(row.id, { target: ctx.dmsAliasTarget.get(key) ?? row.target });
        } else if (row) {
          await this.dms.deleteAlias(key, ctx.dmsAliasTarget.get(key) ?? '');
          await this.dms.addAlias(key, row.target);
        }
      }
      return;
    }

    // dkim — DB side lives on the domain row; never touch DNS, never regenerate.
    if (item.entityType === 'dkim') {
      const wantDms =
        req.resolution === 'import' ||
        (req.resolution === 'field_pick' && (req.fields?.publicKey ?? 'dms') === 'dms');
      if (!wantDms) {
        throw new Error('Cannot push DKIM to DMS from sync — regenerate the key separately');
      }
      const dkim = ctx.dmsDkimByDomain.get(key);
      if (!dkim) throw new Error('DKIM key no longer present in DMS');
      const domain = this.ensureDomainRow(key);
      this.domainRepo.update(domain.id, {
        dkimSelector: dkim.selector,
        dkimPublicKey: dkim.publicKey,
        dkimStatus: 'dns_republish_required',
      });
    }
  }
}
