import type { DomainRow } from '../../db/schema';
import type { DnsRecordResult, DnsValidator } from '../../lib/dns-validator';

const DEFAULT_TTL_MS = 60_000;

export interface DnsCheckResult {
  domain: string;
  checkedAt: string;
  cached: boolean;
  records: DnsRecordResult[];
}

interface CacheEntry {
  expiresAt: number;
  result: DnsCheckResult;
}

export interface DomainDnsServiceOptions {
  ttlMs?: number;
}

export class DomainDnsService {
  private cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  constructor(
    private readonly validator: DnsValidator,
    opts: DomainDnsServiceOptions = {},
  ) {
    this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  }

  async check(domain: DomainRow, opts: { refresh?: boolean } = {}): Promise<DnsCheckResult> {
    const now = Date.now();
    const cached = this.cache.get(domain.id);
    if (!opts.refresh && cached && cached.expiresAt > now) {
      return { ...cached.result, cached: true };
    }

    const records = await this.validator.checkAll(domain.name, {
      dkimSelector: domain.dkimSelector ?? undefined,
      expectedDkimPublicKey: domain.dkimPublicKey ?? undefined,
    });

    const result: DnsCheckResult = {
      domain: domain.name,
      checkedAt: new Date(now).toISOString(),
      cached: false,
      records,
    };
    this.cache.set(domain.id, { expiresAt: now + this.ttlMs, result });
    return result;
  }

  invalidate(id?: string): void {
    if (id !== undefined) this.cache.delete(id);
    else this.cache.clear();
  }
}
