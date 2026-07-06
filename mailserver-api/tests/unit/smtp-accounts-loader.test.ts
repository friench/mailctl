import { describe, it, expect } from 'vitest';
import { SmtpAccountLoader } from '../../src/domain/smtp-accounts/loader';
import type { SmtpAccountRow } from '../../src/db/schema';
import type { SmtpAccountRepository } from '../../src/domain/smtp-accounts/repository';

function row(overrides: Partial<SmtpAccountRow> = {}): SmtpAccountRow {
  return {
    id: 'id-1',
    name: 'test',
    host: 'mail.example.com',
    port: 587,
    secure: false,
    requireTls: false,
    rejectUnauthorized: null,
    minTlsVersion: null,
    userEnvVar: null,
    passwordEnvVar: null,
    fromAddress: 'a@example.com',
    fromName: null,
    priority: 1,
    active: true,
    domainId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('SmtpAccountLoader.resolve', () => {
  it('resolves credentials from custom env vars', () => {
    const loader = new SmtpAccountLoader({} as SmtpAccountRepository, {
      USER_ENV: 'alice',
      PASS_ENV: 'secret',
    });
    const r = loader.resolve(row({ userEnvVar: 'USER_ENV', passwordEnvVar: 'PASS_ENV' }));
    expect(r.user).toBe('alice');
    expect(r.password).toBe('secret');
  });

  it('returns empty strings when env vars are missing', () => {
    const loader = new SmtpAccountLoader({} as SmtpAccountRepository, {});
    const r = loader.resolve(row({ userEnvVar: 'MISSING', passwordEnvVar: 'MISSING' }));
    expect(r.user).toBe('');
    expect(r.password).toBe('');
  });

  it('returns empty user/pass when env var names are null', () => {
    const loader = new SmtpAccountLoader({} as SmtpAccountRepository, { ANY: 'x' });
    const r = loader.resolve(row({ userEnvVar: null, passwordEnvVar: null }));
    expect(r.user).toBe('');
    expect(r.password).toBe('');
  });

  it('builds from string with name when fromName present', () => {
    const loader = new SmtpAccountLoader({} as SmtpAccountRepository, {});
    const r = loader.resolve(row({ fromName: 'Alice', fromAddress: 'alice@ex.com' }));
    expect(r.from).toBe('"Alice" <alice@ex.com>');
  });

  it('uses bare address when fromName is null', () => {
    const loader = new SmtpAccountLoader({} as SmtpAccountRepository, {});
    const r = loader.resolve(row({ fromName: null, fromAddress: 'bare@ex.com' }));
    expect(r.from).toBe('bare@ex.com');
  });

  it('loadActive delegates to repo.listActive', () => {
    const repo = {
      listActive: () => [row({ id: '1' }), row({ id: '2' })],
    } as unknown as SmtpAccountRepository;
    const loader = new SmtpAccountLoader(repo, {});
    const result = loader.loadActive();
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('1');
    expect(result[1]!.id).toBe('2');
  });
});
