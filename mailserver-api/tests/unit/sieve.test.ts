import { describe, it, expect } from 'vitest';
import { buildSieveScript, type SieveConfig } from '../../src/lib/sieve';

const base: SieveConfig = {
  vacation: { enabled: false, subject: '', message: '', days: 7 },
  rules: [],
};

describe('buildSieveScript', () => {
  it('returns an empty string when there is nothing to apply', () => {
    expect(buildSieveScript(base)).toBe('');
  });

  it('skips rules whose match text is blank', () => {
    expect(
      buildSieveScript({
        ...base,
        rules: [{ field: 'subject', contains: '  ', action: 'discard' }],
      }),
    ).toBe('');
  });

  it('compiles a fileinto rule with a folder and requires fileinto', () => {
    const script = buildSieveScript({
      ...base,
      rules: [{ field: 'from', contains: 'boss@corp.com', action: 'fileinto', arg: 'Work' }],
    });
    expect(script).toContain('require ["fileinto"];');
    expect(script).toContain('if header :contains "From" "boss@corp.com" {');
    expect(script).toContain('fileinto "Work";');
  });

  it('defaults fileinto to INBOX when no folder is given', () => {
    const script = buildSieveScript({
      ...base,
      rules: [{ field: 'to', contains: 'list@x.com', action: 'fileinto' }],
    });
    expect(script).toContain('fileinto "INBOX";');
  });

  it('compiles redirect and discard actions', () => {
    const script = buildSieveScript({
      ...base,
      rules: [
        { field: 'to', contains: 'sales@x.com', action: 'redirect', arg: 'crm@x.com' },
        { field: 'subject', contains: 'SPAM', action: 'discard' },
      ],
    });
    expect(script).toContain('redirect "crm@x.com";');
    expect(script).toContain('discard;');
    expect(script).toContain('stop;');
  });

  it('emits a vacation block and requires the vacation extension', () => {
    const script = buildSieveScript({
      ...base,
      vacation: { enabled: true, subject: 'Away', message: 'Back Monday', days: 3 },
    });
    expect(script).toContain('require ["vacation"];');
    expect(script).toContain('vacation :days 3 :subject "Away" "Back Monday";');
  });

  it('omits the :subject clause when the vacation subject is empty', () => {
    const script = buildSieveScript({
      ...base,
      vacation: { enabled: true, subject: '', message: 'Away', days: 7 },
    });
    expect(script).toContain('vacation :days 7 "Away";');
    expect(script).not.toContain(':subject');
  });

  it('clamps vacation days into the 1..365 range', () => {
    expect(
      buildSieveScript({
        ...base,
        vacation: { enabled: true, subject: '', message: 'x', days: -5 },
      }),
    ).toContain('vacation :days 1 ');
    expect(
      buildSieveScript({
        ...base,
        vacation: { enabled: true, subject: '', message: 'x', days: 9999 },
      }),
    ).toContain('vacation :days 365 ');
  });

  it('escapes quotes and backslashes in string literals', () => {
    const script = buildSieveScript({
      ...base,
      rules: [{ field: 'subject', contains: 'a"b\\c', action: 'discard' }],
    });
    expect(script).toContain('"a\\"b\\\\c"');
  });

  it('merges required extensions when both fileinto and vacation are used', () => {
    const script = buildSieveScript({
      vacation: { enabled: true, subject: '', message: 'x', days: 7 },
      rules: [{ field: 'from', contains: 'a@b.com', action: 'fileinto', arg: 'Box' }],
    });
    expect(script).toMatch(/require \["fileinto", "vacation"\];/);
  });
});
