import { describe, it, expect } from 'vitest';
import { isValidDomain, renderMailVhost, vhostFileName } from '../../src/lib/nginx-templates';

describe('isValidDomain', () => {
  it('accepts standard domains', () => {
    expect(isValidDomain('example.com')).toBe(true);
    expect(isValidDomain('example.org')).toBe(true);
    expect(isValidDomain('foo-bar.example.co.uk')).toBe(true);
  });

  it('rejects single-label and invalid forms', () => {
    expect(isValidDomain('localhost')).toBe(false);
    expect(isValidDomain('Example.com')).toBe(false); // uppercase
    expect(isValidDomain('-bad.com')).toBe(false);
    expect(isValidDomain('bad-.com')).toBe(false);
    expect(isValidDomain('a..b')).toBe(false);
    expect(isValidDomain('')).toBe(false);
  });
});

describe('vhostFileName', () => {
  it('builds the expected filename', () => {
    expect(vhostFileName('example.org')).toBe('mail-example-org.conf');
    expect(vhostFileName('foo.bar.co')).toBe('mail-foo-bar-co.conf');
  });

  it('throws on invalid domain', () => {
    expect(() => vhostFileName('Bad Domain')).toThrow(/Invalid domain/);
  });
});

describe('renderMailVhost', () => {
  it('matches snapshot for example.org', () => {
    const out = renderMailVhost('example.org');
    expect(out).toContain('server_name mail.example.org;');
    expect(out).toContain('ssl_certificate /etc/letsencrypt/live/mail.example.org/fullchain.pem;');
    expect(out).toContain('error_log /var/log/nginx/mail-example-org-error.log;');
    expect(out).toContain('access_log /var/log/nginx/mail-example-org-access.log;');
    expect(out).toContain('listen 443 ssl;');
    expect(out).toContain('http2 on;');
    expect(out).toContain('return 403;');
    expect(out).toMatchSnapshot();
  });

  it('produces deterministic output', () => {
    const a = renderMailVhost('a.example.com');
    const b = renderMailVhost('a.example.com');
    expect(a).toBe(b);
  });

  it('throws on invalid domain', () => {
    expect(() => renderMailVhost('not a domain')).toThrow(/Invalid domain/);
  });
});
