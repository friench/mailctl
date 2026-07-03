import { describe, it, expect, beforeEach } from 'vitest';
import { DnsValidator, type DnsLikeResolver } from '../../src/lib/dns-validator';

class StubResolver implements DnsLikeResolver {
  a = new Map<string, string[]>();
  aaaa = new Map<string, string[]>();
  mx = new Map<string, Array<{ exchange: string; priority: number }>>();
  txt = new Map<string, string[][]>();
  srv = new Map<string, Array<{ name: string; port: number; priority: number; weight: number }>>();
  ptr = new Map<string, string[]>();
  rejectA: Error | null = null;

  async resolve4(hostname: string): Promise<string[]> {
    if (this.rejectA) throw this.rejectA;
    return this.a.get(hostname) ?? [];
  }
  async resolve6(hostname: string): Promise<string[]> {
    return this.aaaa.get(hostname) ?? [];
  }
  async resolveMx(hostname: string) {
    return this.mx.get(hostname) ?? [];
  }
  async resolveTxt(hostname: string): Promise<string[][]> {
    return this.txt.get(hostname) ?? [];
  }
  async resolveSrv(hostname: string) {
    return this.srv.get(hostname) ?? [];
  }
  async reverse(ip: string): Promise<string[]> {
    return this.ptr.get(ip) ?? [];
  }
}

describe('DnsValidator', () => {
  let r: StubResolver;
  let v: DnsValidator;

  beforeEach(() => {
    r = new StubResolver();
    v = new DnsValidator({ resolver: r });
  });

  it('returns ok for the core records; optional records missing when unset', async () => {
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
      'AAAA:missing',
      'PTR:missing',
      'MTA-STS:missing',
      'TLS-RPT:missing',
      'AUTODISCOVER:missing',
    ]);
  });

  it('validates the extended records (AAAA, PTR, MTA-STS, TLS-RPT, autodiscover)', async () => {
    r.a.set('mail.example.com', ['203.0.113.10']);
    r.aaaa.set('mail.example.com', ['2001:db8::10']);
    r.ptr.set('203.0.113.10', ['mail.example.com.']);
    r.txt.set('_mta-sts.example.com', [['v=STSv1; id=20260101T000000']]);
    r.txt.set('_smtp._tls.example.com', [['v=TLSRPTv1; rua=mailto:tlsrpt@example.com']]);
    r.srv.set('_autodiscover._tcp.example.com', [
      { name: 'mail.example.com', port: 443, priority: 0, weight: 0 },
    ]);

    const out = await v.checkAll('example.com', { dkimSelector: 'mail' });
    const byType = Object.fromEntries(out.map((x) => [x.type, x.status]));
    expect(byType['AAAA']).toBe('ok');
    expect(byType['PTR']).toBe('ok');
    expect(byType['MTA-STS']).toBe('ok');
    expect(byType['TLS-RPT']).toBe('ok');
    expect(byType['AUTODISCOVER']).toBe('ok');
  });

  it('reports PTR mismatch when reverse DNS points elsewhere', async () => {
    r.a.set('mail.example.com', ['203.0.113.10']);
    r.ptr.set('203.0.113.10', ['other.host.example.net.']);
    const out = await v.checkAll('example.com');
    const ptr = out.find((x) => x.type === 'PTR')!;
    expect(ptr.status).toBe('mismatch');
    expect(ptr.expected).toBe('mail.example.com');
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
