/**
 * Parse the BIND-format DKIM TXT file written by docker-mailserver / OpenDKIM.
 *
 * Layout (DMS keysize 4096 splits the p= value across multiple quoted strings):
 *
 *   mail._domainkey  IN  TXT ( "v=DKIM1; h=sha256; k=rsa; "
 *             "p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA..."
 *             "...rest..." )  ; ----- DKIM key mail for example.com
 */
export interface ParsedDkim {
  /** Selector parsed from the leading `<selector>._domainkey` label. */
  selector: string;
  /** Full unquoted TXT record value (with all chunks concatenated). */
  txtValue: string;
  /** Just the base64 public key portion (the `p=` value, no surrounding tags). */
  publicKey: string;
}

const QUOTED_RE = /"((?:[^"\\]|\\.)*)"/g;
const SELECTOR_RE = /^([A-Za-z0-9_-]+)\._domainkey\b/m;

export function parseDkimFile(content: string): ParsedDkim {
  const stripped = stripComments(content);

  const selectorMatch = SELECTOR_RE.exec(stripped);
  if (!selectorMatch || !selectorMatch[1]) {
    throw new Error('DKIM file does not contain a "<selector>._domainkey" label');
  }
  const selector = selectorMatch[1];

  const chunks: string[] = [];
  for (const m of stripped.matchAll(QUOTED_RE)) {
    chunks.push(m[1] ?? '');
  }
  if (chunks.length === 0) {
    throw new Error('DKIM file does not contain any quoted TXT chunks');
  }

  const txtValue = chunks.join('');
  const publicKey = extractPValue(txtValue);
  if (!publicKey) {
    throw new Error('DKIM TXT value does not contain a "p=" tag');
  }

  return { selector, txtValue, publicKey };
}

function stripComments(content: string): string {
  return content
    .split('\n')
    .map((line) => {
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"' && line[i - 1] !== '\\') inQuotes = !inQuotes;
        if (ch === ';' && !inQuotes) return line.slice(0, i);
      }
      return line;
    })
    .join('\n');
}

function extractPValue(txt: string): string | undefined {
  const idx = txt.indexOf('p=');
  if (idx < 0) return undefined;
  const tail = txt.slice(idx + 2);
  const next = tail.search(/[;\s]/);
  const raw = next < 0 ? tail : tail.slice(0, next);
  return raw.replace(/\s+/g, '');
}
