import { describe, it, expect } from 'vitest';
import { parseDkimFindOutput } from '../../src/domain/mailboxes/dockerode-dms-client';

const KEYS_DIR = '/tmp/docker-mailserver/opendkim/keys';

function bindKey(selector: string, domain: string, pub: string): string {
  return `${selector}._domainkey IN TXT ( "v=DKIM1; h=sha256; k=rsa; "\n            "p=${pub}" ) ; ----- DKIM key ${selector} for ${domain}\n`;
}

/** Simulate the `find ... -exec echo @@FILE@@{} -exec cat {}` output for two domains. */
function findOutput(entries: Array<{ domain: string; selector: string; pub: string }>): string {
  return entries
    .map(
      ({ domain, selector, pub }) =>
        `@@FILE@@${KEYS_DIR}/${domain}/${selector}.txt\n${bindKey(selector, domain, pub)}`,
    )
    .join('');
}

describe('parseDkimFindOutput', () => {
  it('parses both domains with correct domain/selector/publicKey', () => {
    const stdout = findOutput([
      { domain: 'example.com', selector: 'mail', pub: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AAAAA==' },
      { domain: 'other.org', selector: 'dms2024', pub: 'ZZZZZZZZZZZZ==' },
    ]);

    const result = parseDkimFindOutput(stdout);

    expect(result).toEqual([
      {
        domain: 'example.com',
        selector: 'mail',
        publicKey: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AAAAA==',
      },
      { domain: 'other.org', selector: 'dms2024', publicKey: 'ZZZZZZZZZZZZ==' },
    ]);
  });

  it('returns [] for empty input', () => {
    expect(parseDkimFindOutput('')).toEqual([]);
  });

  it('skips blocks whose contents fail to parse', () => {
    const stdout =
      `@@FILE@@${KEYS_DIR}/bad.com/mail.txt\nnot a valid dkim file\n` +
      `@@FILE@@${KEYS_DIR}/good.com/mail.txt\n${bindKey('mail', 'good.com', 'AAAA')}`;

    const result = parseDkimFindOutput(stdout);

    expect(result).toEqual([{ domain: 'good.com', selector: 'mail', publicKey: 'AAAA' }]);
  });
});
