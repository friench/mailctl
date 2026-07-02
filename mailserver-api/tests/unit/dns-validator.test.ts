import { describe, it, expect, beforeEach } from 'vitest';
import { DnsValidator, type DnsLikeResolver } from '../../src/lib/dns-validator';

class StubResolver implements DnsLikeResolver {
  a = new Map<string, string[]>();
  mx = new Map<string, Array<{ exchange: string; priority: number }>>();
  txt = new Map<string, string[][]>();
  rejectA: Error | null = null;

  async resolve4(hostname: string): Promise<string[]> {
    if (this.rejectA) throw this.rejectA;
    return this.a.get(hostname) ?? [];
  }
  async resolveMx(hostname: string) {
    return this.mx.get(hostname) ?? [];
  }
  async resolveTxt(hostname: string): Promise<string[][]> {
    return this.txt.get(hostname) ?? [];
  }
}

describe('DnsValidator', () => {
  let r: StubResolver;
  let v: DnsValidator;

  beforeEach(() => {
    r = new StubResolver();
    v = new DnsValidator({ resolver: r });
  });

  it('returns ok for all 5 records when DNS is correctly configured', async () => {
    r.a.set('mail.example.com', ['203.0.113.10']);
    r.mx.set('example.com', [{ exchange: 'mail.example.com', priority: 10 }]);
    r.txt.set('example.com', [['v=spf1 a mx -all']]);
    r.txt.set('mail._domainkey.example.com', [['v=DKIM1; h=sha256; k=rsa; p=ABCD']]);
    r.txt.set('_dmarc.example.com', [['v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com']]);

    const out = await v.checkAll('example.com', { dkimSelector: 'mail' });
    expect(out.map((x) => `${x.type}:${x.status}`)).toEqual([
      'A:ok',
      'MX:ok',
      'SPF:ok',
      'DKIM:ok',
      'DMARC:ok',
    ]);
  });

  it('reports missing for empty answers', async () => {
    const out = await v.checkAll('example.com', { dkimSelector: 'mail' });
    expect(out.find((x) => x.type === 'A')?.status).toBe('missing');
    expect(out.find((x) => x.type === 'SPF')?.status).toBe('missing');
    expect(out.find((x) => x.type === 'DKIM')?.status).toBe('missing');
  });

  it('detects A mismatch when expectedMailIp differs', async () => {
    r.a.set('mail.example.com', ['198.51.100.1']);
    const out = await v.checkAll('example.com', { expectedMailIp: '203.0.113.10' });
    const a = out.find((x) => x.type === 'A')!;
    expect(a.status).toBe('mismatch');
    expect(a.expected).toBe('203.0.113.10');
  });

  it('detects DKIM mismatch when stored key differs', async () => {
    r.txt.set('mail._domainkey.example.com', [['v=DKIM1; p=DIFFERENT']]);
    const out = await v.checkAll('example.com', {
      dkimSelector: 'mail',
      expectedDkimPublicKey: 'EXPECTED',
    });
    const dkim = out.find((x) => x.type === 'DKIM')!;
    expect(dkim.status).toBe('mismatch');
  });

  it('skips DKIM gracefully when no selector configured', async () => {
    const out = await v.checkAll('example.com', {});
    const dkim = out.find((x) => x.type === 'DKIM')!;
    expect(dkim.status).toBe('missing');
    expect(dkim.message).toMatch(/selector/i);
  });

  it('returns error status on resolver throw', async () => {
    r.rejectA = new Error('ENOTFOUND');
    const out = await v.checkAll('example.com', { dkimSelector: 'mail' });
    const a = out.find((x) => x.type === 'A')!;
    expect(a.status).toBe('error');
    expect(a.message).toBe('ENOTFOUND');
  });

  it('reports MX mismatch when MX does not point to mail.<domain>', async () => {
    r.mx.set('example.com', [{ exchange: 'other.example.org', priority: 10 }]);
    const out = await v.checkAll('example.com');
    const mx = out.find((x) => x.type === 'MX')!;
    expect(mx.status).toBe('mismatch');
    expect(mx.actual).toEqual(['10 other.example.org']);
  });

  it('joins multi-chunk TXT records before matching', async () => {
    r.txt.set('mail._domainkey.example.com', [['v=DKIM1; h=sha256; ', 'k=rsa; p=AAAA']]);
    const out = await v.checkAll('example.com', {
      dkimSelector: 'mail',
      expectedDkimPublicKey: 'AAAA',
    });
    expect(out.find((x) => x.type === 'DKIM')?.status).toBe('ok');
  });
});
