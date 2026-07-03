import { randomBytes } from 'node:crypto';
import { BusinessError } from '../../lib/errors';
import { domainOf } from '../../lib/address';
import type { DomainRepository } from '../domains/repository';
import type { AliasRow } from '../../db/schema';
import type { DmsClient } from '../mailboxes/dms-client';
import type { AliasRepository } from './repository';

export interface CreateAliasInput {
  address: string;
  target: string;
  notes?: string | null;
}

export interface GenerateTempAliasInput {
  domain: string;
  target: string;
  ttlHours?: number;
  notes?: string | null;
}

export class AliasService {
  constructor(
    private readonly repo: AliasRepository,
    private readonly domainRepo: DomainRepository,
    private readonly dms: DmsClient,
  ) {}

  list(): AliasRow[] {
    return this.repo.list();
  }

  findById(id: string): AliasRow | undefined {
    return this.repo.findById(id);
  }

  async create(input: CreateAliasInput): Promise<AliasRow> {
    const address = input.address.toLowerCase();
    const domainPart = domainOf(address);
    const domain = domainPart ? this.domainRepo.findByName(domainPart) : undefined;
    if (!domain) {
      throw new BusinessError(400, `Domain "${domainPart}" is not registered`, 'DOMAIN_NOT_FOUND');
    }
    if (!domain.active) {
      throw new BusinessError(400, `Domain "${domain.name}" is disabled`, 'DOMAIN_DISABLED');
    }
    if (this.repo.findByAddress(address)) {
      throw new BusinessError(409, `Alias "${address}" already exists`, 'ALIAS_EXISTS');
    }

    await this.dms.addAlias(address, input.target);
    const created = this.repo.create({
      address,
      target: input.target,
      domainId: domain.id,
      source: 'panel',
      notes: input.notes ?? null,
    });
    return created;
  }

  async update(id: string, input: { target?: string; notes?: string | null }): Promise<AliasRow> {
    const row = this.repo.findById(id);
    if (!row) throw new BusinessError(404, 'Alias not found');

    if (input.target !== undefined && input.target !== row.target) {
      // Reflect the retarget into docker-mailserver: drop the old mapping, add the new.
      await this.dms.deleteAlias(row.address, row.target);
      await this.dms.addAlias(row.address, input.target);
    }

    const updated = this.repo.update(id, {
      ...(input.target !== undefined ? { target: input.target } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    });
    if (!updated) throw new BusinessError(404, 'Alias not found');
    return updated;
  }

  async delete(id: string): Promise<void> {
    const row = this.repo.findById(id);
    if (!row) throw new BusinessError(404, 'Alias not found');
    await this.dms.deleteAlias(row.address, row.target);
    this.repo.delete(id);
  }

  /**
   * Generate a random temporary alias (`tmp-<hex>@domain`) forwarding to `target`.
   * When `ttlHours` is set the alias auto-expires and is removed by the prune worker.
   */
  async generateTemp(input: GenerateTempAliasInput, now: Date = new Date()): Promise<AliasRow> {
    const domain = this.domainRepo.findByName(input.domain.toLowerCase());
    if (!domain) {
      throw new BusinessError(
        400,
        `Domain "${input.domain}" is not registered`,
        'DOMAIN_NOT_FOUND',
      );
    }
    if (!domain.active) {
      throw new BusinessError(400, `Domain "${domain.name}" is disabled`, 'DOMAIN_DISABLED');
    }

    let address = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = `tmp-${randomBytes(4).toString('hex')}@${domain.name}`;
      if (!this.repo.findByAddress(candidate)) {
        address = candidate;
        break;
      }
    }
    if (!address) {
      throw new BusinessError(
        500,
        'Could not generate a unique temp address',
        'TEMP_ALIAS_COLLISION',
      );
    }

    const expiresAt =
      input.ttlHours !== undefined ? new Date(now.getTime() + input.ttlHours * 3_600_000) : null;

    await this.dms.addAlias(address, input.target);
    return this.repo.create({
      address,
      target: input.target,
      domainId: domain.id,
      source: 'panel',
      notes: input.notes ?? null,
      expiresAt,
    });
  }

  /** Remove temp aliases whose TTL has passed (from DMS + DB). Returns the count pruned. */
  async pruneExpired(now: Date = new Date()): Promise<number> {
    const expired = this.repo.findExpired(now);
    let pruned = 0;
    for (const row of expired) {
      try {
        await this.dms.deleteAlias(row.address, row.target);
        this.repo.delete(row.id);
        pruned++;
      } catch {
        // Leave the row for the next tick if DMS removal fails.
      }
    }
    return pruned;
  }
}
