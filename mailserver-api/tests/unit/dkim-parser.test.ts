import { describe, it, expect } from 'vitest';
import { parseDkimFile } from '../../src/lib/dkim-parser';

const SAMPLE_2048 = `mail._domainkey IN TXT ( "v=DKIM1; h=sha256; k=rsa; "
            "p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAabcdef==" ) ; ----- DKIM key mail for example.com
`;

const SAMPLE_4096_SPLIT = `mail._domainkey IN TXT ( "v=DKIM1; h=sha256; k=rsa; "
  "p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy=="  ) ; ----- DKIM key mail for example.com
`;

const CUSTOM_SELECTOR = `dms2024._domainkey IN TXT ( "v=DKIM1; k=rsa; p=ZZZZ" ) ;
`;

describe('parseDkimFile', () => {
  it('parses a single-line key', () => {
    const r = parseDkimFile(SAMPLE_2048);
    expect(r.selector).toBe('mail');
    expect(r.publicKey).toBe('MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAabcdef==');
    expect(r.txtValue).toMatch(/^v=DKIM1/);
  });

  it('concatenates split chunks (4096-bit key)', () => {
    const r = parseDkimFile(SAMPLE_4096_SPLIT);
    expect(r.selector).toBe('mail');
    expect(r.publicKey.startsWith('MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A')).toBe(true);
    expect(r.publicKey.endsWith('yyyy==')).toBe(true);
    // No whitespace inside the key:
    expect(r.publicKey).not.toMatch(/\s/);
  });

  it('extracts a non-default selector', () => {
    const r = parseDkimFile(CUSTOM_SELECTOR);
    expect(r.selector).toBe('dms2024');
    expect(r.publicKey).toBe('ZZZZ');
  });

  it('throws when no _domainkey label is present', () => {
    expect(() => parseDkimFile('"v=DKIM1; p=abc"')).toThrow(/_domainkey/);
  });

  it('throws when no quoted TXT chunks are present', () => {
    expect(() => parseDkimFile('mail._domainkey IN TXT')).toThrow(/quoted TXT chunks/);
  });

  it('throws when no p= tag is present', () => {
    expect(() => parseDkimFile('mail._domainkey IN TXT ("v=DKIM1; k=rsa;")')).toThrow(/"p="/);
  });

  it('strips inline comments before extracting chunks', () => {
    const content = `mail._domainkey IN TXT ( "v=DKIM1; p=AAAA" ) ; "p=BAD"
`;
    const r = parseDkimFile(content);
    expect(r.publicKey).toBe('AAAA');
  });
});
