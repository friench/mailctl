import type { Logger } from '../../logger';
import { BusinessError } from '../../lib/errors';
import type { DomainRow } from '../../db/schema';
import type { DmsClient } from '../mailboxes/dms-client';
import type { FeatureFlagService } from '../feature-flags/service';
import type { NginxService } from '../nginx/service';
import type { CreateDomainInput, DomainRepository, UpdateDomainInput } from './repository';

const DEFAULT_DKIM_SELECTOR = 'mail';
const DEFAULT_DKIM_KEYSIZE: 2048 | 4096 = 2048;

export interface DomainServiceOptions {
  defaultSelector?: string;
  defaultKeysize?: 2048 | 4096;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && (err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE';
}

export class DomainService {
  private readonly defaultSelector: string;
  private readonly defaultKeysize: 2048 | 4096;

  constructor(
    private readonly repo: DomainRepository,
    private readonly dms: DmsClient,
    private readonly flags: FeatureFlagService,
    private readonly logger: Logger,
    private readonly nginxService: NginxService,
    opts: DomainServiceOptions = {},
  ) {
    this.defaultSelector = opts.defaultSelector ?? DEFAULT_DKIM_SELECTOR;
    this.defaultKeysize = opts.defaultKeysize ?? DEFAULT_DKIM_KEYSIZE;
  }

  list(): DomainRow[] {
    return this.repo.list();
  }

  findById(id: string): DomainRow | undefined {
    return this.repo.findById(id);
  }

  async create(input: CreateDomainInput): Promise<DomainRow> {
    let row: DomainRow;
    try {
      row = this.repo.create(input);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new BusinessError(409, 'Domain with this name already exists');
      }
      throw err;
    }
    if (this.flags.isEnabled('auto_dkim_enabled')) {
      const selector = row.dkimSelector ?? this.defaultSelector;
      // Fire-and-forget: failures are logged, do not block create.
      void this.regenerateDkim(row.id, selector, this.defaultKeysize).catch((err) => {
        this.logger.warn({ err, domain: row.name }, 'auto-DKIM generation failed');
      });
    }
    await this.nginxService.regenerate();
    return row;
  }

  async update(id: string, input: UpdateDomainInput): Promise<DomainRow> {
    const row = this.repo.update(id, input);
    if (!row) throw new BusinessError(404, 'Domain not found');
    await this.nginxService.regenerate();
    return row;
  }

  async delete(id: string): Promise<void> {
    const ok = this.repo.delete(id);
    if (!ok) throw new BusinessError(404, 'Domain not found');
    await this.nginxService.regenerate();
  }

  async regenerateDkim(
    id: string,
    selector?: string,
    keysize: 2048 | 4096 = this.defaultKeysize,
  ): Promise<DomainRow> {
    const row = this.repo.findById(id);
    if (!row) throw new BusinessError(404, 'Domain not found');

    const useSelector = selector ?? row.dkimSelector ?? this.defaultSelector;

    await this.dms.generateDkim(row.name, useSelector, keysize);
    const publicKey = await this.dms.readDkimPublicKey(row.name, useSelector);

    const updated = this.repo.update(id, {
      dkimSelector: useSelector,
      dkimPublicKey: publicKey,
    });
    if (!updated) throw new BusinessError(404, 'Domain not found');
    this.logger.info({ domain: row.name, selector: useSelector, keysize }, 'DKIM key regenerated');
    return updated;
  }
}
