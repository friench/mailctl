import { describe, it, expect } from 'vitest';
import { buildTransportOptions } from '../../src/domain/send/mailer';
import type { ResolvedSmtpAccount } from '../../src/domain/smtp-accounts/loader';

function account(over: Partial<ResolvedSmtpAccount> = {}): ResolvedSmtpAccount {
  return {
    id: 'a',
    name: 'a',
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    user: '',
    password: '',
    fromAddress: 'a@example.com',
    fromName: null,
    from: 'a@example.com',
    priority: 1,
    requireTls: false,
    rejectUnauthorized: null,
    minTlsVersion: null,
    ...over,
  };
}

describe('buildTransportOptions', () => {
  it('inherits the global rejectUnauthorized when the account leaves it null', () => {
    expect(buildTransportOptions(account(), true).tls).toEqual({ rejectUnauthorized: true });
    expect(buildTransportOptions(account(), false).tls).toEqual({ rejectUnauthorized: false });
  });

  it('lets the account override the global rejectUnauthorized', () => {
    expect(buildTransportOptions(account({ rejectUnauthorized: false }), true).tls).toEqual({
      rejectUnauthorized: false,
    });
    expect(buildTransportOptions(account({ rejectUnauthorized: true }), false).tls).toEqual({
      rejectUnauthorized: true,
    });
  });

  it('sets requireTLS from the account policy', () => {
    expect(buildTransportOptions(account({ requireTls: true }), true).requireTLS).toBe(true);
    expect(buildTransportOptions(account(), true).requireTLS).toBe(false);
  });

  it('pins minVersion when set, omits it otherwise', () => {
    expect(
      buildTransportOptions(account({ minTlsVersion: 'TLSv1.3' }), true).tls as object,
    ).toEqual({ rejectUnauthorized: true, minVersion: 'TLSv1.3' });
    expect(buildTransportOptions(account(), true).tls).not.toHaveProperty('minVersion');
  });

  it('adds auth only when a user is resolved', () => {
    expect(buildTransportOptions(account(), true).auth).toBeUndefined();
    expect(buildTransportOptions(account({ user: 'u', password: 'p' }), true).auth).toEqual({
      user: 'u',
      pass: 'p',
    });
  });
});
