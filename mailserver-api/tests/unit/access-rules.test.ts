import { describe, it, expect } from 'vitest';
import {
  AccessRuleError,
  normalizeRecipient,
  normalizeValue,
  renderAccessConfig,
  type AccessRuleInput,
} from '../../src/lib/access-rules';

describe('normalizeValue', () => {
  it('lowercases and validates emails', () => {
    expect(normalizeValue('email', '  Spam@Bad.Example ')).toBe('spam@bad.example');
    expect(() => normalizeValue('email', 'not-an-email')).toThrow(AccessRuleError);
  });

  it('validates domains', () => {
    expect(normalizeValue('domain', 'Bad.Example')).toBe('bad.example');
    expect(() => normalizeValue('domain', 'nope')).toThrow(AccessRuleError);
  });

  it('accepts IPv4, IPv6 and CIDR', () => {
    expect(normalizeValue('ip', '203.0.113.5')).toBe('203.0.113.5');
    expect(normalizeValue('ip', '203.0.113.0/24')).toBe('203.0.113.0/24');
    expect(normalizeValue('ip', '2001:DB8::1')).toBe('2001:db8::1');
    expect(() => normalizeValue('ip', 'zzz')).toThrow(AccessRuleError);
  });

  it('rejects empty values', () => {
    expect(() => normalizeValue('email', '   ')).toThrow(AccessRuleError);
  });
});

describe('normalizeRecipient', () => {
  it('returns null for empty', () => {
    expect(normalizeRecipient(null)).toBeNull();
    expect(normalizeRecipient('')).toBeNull();
  });
  it('validates an email recipient', () => {
    expect(normalizeRecipient('User@Example.org')).toBe('user@example.org');
    expect(() => normalizeRecipient('bad')).toThrow(AccessRuleError);
  });
});

const rule = (over: Partial<AccessRuleInput>): AccessRuleInput => ({
  matchType: 'email',
  action: 'block',
  value: 'spam@bad.example',
  recipient: null,
  ...over,
});

describe('renderAccessConfig — global rules', () => {
  it('splits global email/domain into Postfix sender access with verdicts', () => {
    const files = renderAccessConfig([
      rule({ matchType: 'email', action: 'block', value: 'spam@bad.example' }),
      rule({ matchType: 'domain', action: 'allow', value: 'partner.example' }),
    ]);
    expect(files.postfixSender).toContain('spam@bad.example REJECT');
    expect(files.postfixSender).toContain('partner.example OK');
    expect(files.postfixClient).toBe('');
  });

  it('routes IP rules into Postfix client access', () => {
    const files = renderAccessConfig([
      rule({ matchType: 'ip', action: 'block', value: '203.0.113.5' }),
    ]);
    expect(files.postfixClient).toContain('203.0.113.5 REJECT');
    expect(files.postfixSender).toBe('');
  });

  it('populates the four Rspamd global maps by action/type', () => {
    const files = renderAccessConfig([
      rule({ matchType: 'email', action: 'block', value: 'a@bad.example' }),
      rule({ matchType: 'domain', action: 'allow', value: 'good.example' }),
      rule({ matchType: 'ip', action: 'block', value: '10.0.0.1' }),
      rule({ matchType: 'ip', action: 'allow', value: '10.0.0.2' }),
    ]);
    expect(files.rspamdFromBlock).toBe('a@bad.example\n');
    expect(files.rspamdFromAllow).toBe('good.example\n');
    expect(files.rspamdIpBlock).toBe('10.0.0.1\n');
    expect(files.rspamdIpAllow).toBe('10.0.0.2\n');
    expect(files.rspamdConf).toContain('PANEL_BLOCK_FROM');
    expect(files.postfixMainCf).toContain('check_sender_access');
  });

  it('emits empty map files when there are no global rules', () => {
    const files = renderAccessConfig([]);
    expect(files.postfixSender).toBe('');
    expect(files.rspamdFromBlock).toBe('');
    expect(files.rspamdRcptLua).toContain('no per-recipient rules');
  });
});

describe('renderAccessConfig — per-recipient rules', () => {
  it('excludes per-recipient rules from the global Postfix/Rspamd maps', () => {
    const files = renderAccessConfig([
      rule({ recipient: 'user@example.org', value: 'spam@bad.example' }),
    ]);
    expect(files.postfixSender).toBe('');
    expect(files.rspamdFromBlock).toBe('');
  });

  it('renders a Lua prefilter keyed by recipient|type|value', () => {
    const files = renderAccessConfig([
      rule({
        recipient: 'user@example.org',
        matchType: 'email',
        action: 'block',
        value: 'x@bad.example',
      }),
      rule({
        recipient: 'boss@example.org',
        matchType: 'domain',
        action: 'allow',
        value: 'vip.example',
      }),
    ]);
    expect(files.rspamdRcptLua).toContain("['user@example.org|email|x@bad.example'] = 'block'");
    expect(files.rspamdRcptLua).toContain("['boss@example.org|domain|vip.example'] = 'allow'");
    expect(files.rspamdRcptLua).toContain('register_symbol');
    expect(files.rspamdRcptLua).toContain('set_pre_result');
  });

  it('escapes quotes in Lua keys', () => {
    const files = renderAccessConfig([
      rule({ recipient: "o'brien@example.org", value: 'x@bad.example' }),
    ]);
    expect(files.rspamdRcptLua).toContain("o\\'brien@example.org");
  });
});
