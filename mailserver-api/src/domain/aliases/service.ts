import { BusinessError } from '../../lib/errors';
import { domainOf } from '../../lib/address';
import type { DomainRepository } from '../domains/repository';
import type { AliasRow } from '../../db/schema';
import type { DmsClient } from '../mailboxes/dms-client';
import type { AliasRepository } from './repository';

export interface CreateAliasInput {
  address: string;
  target: string;
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
    });
    return created;
  }

  async delete(id: string): Promise<void> {
    const row = this.repo.findById(id);
    if (!row) throw new BusinessError(404, 'Alias not found');
    await this.dms.deleteAlias(row.address, row.target);
    this.repo.delete(id);
  }
}
