import { Resolver } from 'node:dns/promises';

/** Per-record-type result. `null` value means "not found / empty". */
export interface DnsRecordResult {
  type: 'A' | 'MX' | 'SPF' | 'DKIM' | 'DMARC';
  hostname: string;
  status: 'ok' | 'missing' | 'mismatch' | 'error';
  expected?: string;
  actual: string[];
  message?: string;
}

export interface DnsCheckOptions {
  /** Hostname expected for A record on `mail.<domain>`. Optional — when omitted the A check just confirms presence. */
  expectedMailIp?: string;
  /** DKIM selector. If omitted, the DKIM check is skipped (status: 'missing'). */
  dkimSelector?: string;
  /** Expected p= value (full DKIM TXT or just the public key); optional. */
  expectedDkimPublicKey?: string;
  /** Per-query timeout. Defaults to 5000 ms. */
  timeoutMs?: number;
}

export interface DnsValidatorDeps {
  /** Inject a custom resolver (for tests). When omitted, a default Node Resolver is used. */
  resolver?: DnsLikeResolver;
}

/** The subset of `dns/promises.Resolver` we use — keeps the seam tiny for tests. */
export interface DnsLikeResolver {
  resolve4(hostname: string): Promise<string[]>;
  resolveMx(hostname: string): Promise<Array<{ exchange: string; priority: number }>>;
  resolveTxt(hostname: string): Promise<string[][]>;
}

const DEFAULT_TIMEOUT_MS = 5000;

export class DnsValidator {
  private readonly resolver: DnsLikeResolver;

  constructor(deps: DnsValidatorDeps = {}) {
    this.resolver = deps.resolver ?? new Resolver();
  }

  async checkAll(domain: string, opts: DnsCheckOptions = {}): Promise<DnsRecordResult[]> {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const dkimHost = opts.dkimSelector
      ? `${opts.dkimSelector}._domainkey.${domain}`
      : `_domainkey.${domain}`;

    return Promise.all([
      this.checkA(`mail.${domain}`, opts.expectedMailIp, timeoutMs),
      this.checkMx(domain, timeoutMs),
      this.checkSpf(domain, timeoutMs),
      this.checkDkim(dkimHost, opts.dkimSelector, opts.expectedDkimPublicKey, timeoutMs),
      this.checkDmarc(domain, timeoutMs),
    ]);
  }

  async checkA(
    hostname: string,
    expected: string | undefined,
    timeoutMs: number,
  ): Promise<DnsRecordResult> {
    return this.run('A', hostname, timeoutMs, async () => {
      const actual = await this.resolver.resolve4(hostname);
      if (actual.length === 0) {
        return { actual, status: 'missing' as const };
      }
      if (expected && !actual.includes(expected)) {
        return {
          actual,
          status: 'mismatch' as const,
          expected,
          message: `Expected ${expected}, got ${actual.join(', ')}`,
        };
      }
      return { actual, status: 'ok' as const, expected };
    });
  }

  async checkMx(domain: string, timeoutMs: number): Promise<DnsRecordResult> {
    return this.run('MX', domain, timeoutMs, async () => {
      const records = await this.resolver.resolveMx(domain);
      const sorted = records
        .slice()
        .sort((a, b) => a.priority - b.priority)
        .map((r) => `${r.priority} ${r.exchange}`);
      if (sorted.length === 0) {
        return { actual: sorted, status: 'missing' as const };
      }
      const expected = `mail.${domain}`;
      const matches = records.some((r) => r.exchange.toLowerCase().replace(/\.$/, '') === expected);
      if (!matches) {
        return {
          actual: sorted,
          status: 'mismatch' as const,
          expected,
          message: `MX does not point to ${expected}`,
        };
      }
      return { actual: sorted, status: 'ok' as const, expected };
    });
  }

  async checkSpf(domain: string, timeoutMs: number): Promise<DnsRecordResult> {
    return this.run('SPF', domain, timeoutMs, async () => {
      const txt = await this.resolveTxtJoined(domain);
      const spf = txt.filter((v) => v.toLowerCase().startsWith('v=spf1'));
      if (spf.length === 0) {
        return { actual: txt, status: 'missing' as const, message: 'No SPF record (v=spf1...)' };
      }
      return { actual: spf, status: 'ok' as const };
    });
  }

  async checkDkim(
    hostname: string,
    selector: string | undefined,
    expectedPublicKey: string | undefined,
    timeoutMs: number,
  ): Promise<DnsRecordResult> {
    if (!selector) {
      return {
        type: 'DKIM',
        hostname,
        status: 'missing',
        actual: [],
        message: 'No DKIM selector configured for this domain',
      };
    }
    return this.run('DKIM', hostname, timeoutMs, async () => {
      const txt = await this.resolveTxtJoined(hostname);
      const dkim = txt.filter((v) => /v=DKIM1/i.test(v) || /(?:^|;)\s*p=/i.test(v));
      if (dkim.length === 0) {
        return { actual: txt, status: 'missing' as const, message: 'No DKIM TXT record' };
      }
      if (expectedPublicKey) {
        const expected = expectedPublicKey.replace(/\s+/g, '');
        const match = dkim.some((v) => v.replace(/\s+/g, '').includes(expected));
        if (!match) {
          return {
            actual: dkim,
            status: 'mismatch' as const,
            expected,
            message: 'DKIM public key in DNS differs from stored value',
          };
        }
      }
      return { actual: dkim, status: 'ok' as const };
    });
  }

  async checkDmarc(domain: string, timeoutMs: number): Promise<DnsRecordResult> {
    const hostname = `_dmarc.${domain}`;
    return this.run('DMARC', hostname, timeoutMs, async () => {
      const txt = await this.resolveTxtJoined(hostname);
      const dmarc = txt.filter((v) => /^v=DMARC1/i.test(v));
      if (dmarc.length === 0) {
        return {
          actual: txt,
          status: 'missing' as const,
          message: 'No DMARC record (v=DMARC1...)',
        };
      }
      return { actual: dmarc, status: 'ok' as const };
    });
  }

  private async resolveTxtJoined(hostname: string): Promise<string[]> {
    const records = await this.resolver.resolveTxt(hostname);
    return records.map((chunks) => chunks.join(''));
  }

  private async run(
    type: DnsRecordResult['type'],
    hostname: string,
    timeoutMs: number,
    fn: () => Promise<{
      actual: string[];
      status: DnsRecordResult['status'];
      expected?: string;
      message?: string;
    }>,
  ): Promise<DnsRecordResult> {
    let timeoutHandle: NodeJS.Timeout | undefined;
    const timer = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error(`DNS query for ${hostname} timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });
    try {
      const result = await Promise.race([fn(), timer]);
      return { type, hostname, ...result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { type, hostname, status: 'error', actual: [], message };
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }
}
