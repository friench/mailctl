import { describe, it, expect } from 'vitest';
import { renderFetchmailConfig, type FetchmailAccountInput } from '../../src/lib/fetchmail';

const acct = (over: Partial<FetchmailAccountInput> = {}): FetchmailAccountInput => ({
  pollServer: 'imap.old.example',
  protocol: 'imap',
  port: null,
  username: 'remote@old.example',
  password: 'secret',
  destAddress: 'local@example.org',
  ssl: true,
  keep: true,
  ...over,
});

describe('renderFetchmailConfig', () => {
  it('renders a header-only file when there are no accounts', () => {
    const out = renderFetchmailConfig([]);
    expect(out).toContain('Managed by mailctl');
    expect(out).not.toContain('poll ');
  });

  it('renders an IMAP poll entry with ssl + keep', () => {
    const out = renderFetchmailConfig([acct()]);
    expect(out).toContain('poll "imap.old.example" protocol IMAP');
    expect(out).toContain(
      'user "remote@old.example" there with password "secret" is "local@example.org" here',
    );
    expect(out).toContain('ssl keep');
  });

  it('uppercases POP3 and includes an explicit port', () => {
    const out = renderFetchmailConfig([acct({ protocol: 'pop3', port: 995 })]);
    expect(out).toContain('protocol POP3 port 995');
  });

  it('emits nokeep and omits ssl when disabled', () => {
    const out = renderFetchmailConfig([acct({ ssl: false, keep: false })]);
    expect(out).toContain('nokeep');
    expect(out).not.toMatch(/\bssl\b/);
  });

  it('escapes quotes and backslashes in values', () => {
    const out = renderFetchmailConfig([acct({ password: 'a"b\\c' })]);
    expect(out).toContain('password "a\\"b\\\\c"');
  });

  it('renders multiple accounts separated by a blank line', () => {
    const out = renderFetchmailConfig([acct(), acct({ pollServer: 'pop.two.example' })]);
    expect(out.match(/poll /g)).toHaveLength(2);
  });
});
