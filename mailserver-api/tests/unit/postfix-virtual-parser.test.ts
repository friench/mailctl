import { describe, it, expect } from 'vitest';
import { parsePostfixVirtual } from '../../src/lib/postfix-virtual-parser';

describe('parsePostfixVirtual', () => {
  it('parses simple alias → target lines', () => {
    const out = parsePostfixVirtual('info@example.com  user@example.com\n');
    expect(out).toEqual([{ address: 'info@example.com', target: 'user@example.com' }]);
  });

  it('ignores comments and blank lines', () => {
    const content = ['# a comment', '', '  ', 'sales@example.com bob@example.com # inline'].join(
      '\n',
    );
    expect(parsePostfixVirtual(content)).toEqual([
      { address: 'sales@example.com', target: 'bob@example.com' },
    ]);
  });

  it('normalizes multiple comma/space targets to a comma-joined string', () => {
    const out = parsePostfixVirtual('all@example.com  a@example.com, b@example.com c@example.com');
    expect(out).toEqual([
      { address: 'all@example.com', target: 'a@example.com,b@example.com,c@example.com' },
    ]);
  });

  it('lowercases the alias address', () => {
    expect(parsePostfixVirtual('Info@Example.com x@example.com')[0]?.address).toBe(
      'info@example.com',
    );
  });

  it('skips lines without a target', () => {
    expect(parsePostfixVirtual('lonely@example.com')).toEqual([]);
  });
});
