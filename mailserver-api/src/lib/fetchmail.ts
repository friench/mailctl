import type { FetchmailProtocol } from '../db/schema';

/** A fetchmail poll account with the password already decrypted, ready to render. */
export interface FetchmailAccountInput {
  pollServer: string;
  protocol: FetchmailProtocol;
  port: number | null;
  username: string;
  password: string;
  destAddress: string;
  ssl: boolean;
  keep: boolean;
}

/** Quote + escape a value for a fetchmail rc double-quoted string. */
function q(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Render a fetchmail control file (`fetchmail.cf`) from the active accounts.
 * docker-mailserver wraps this with the daemon settings (`FETCHMAIL_POLL`) and
 * runs it when `ENABLE_FETCHMAIL=1`. Returns a header-only file when empty.
 */
export function renderFetchmailConfig(accounts: FetchmailAccountInput[]): string {
  const header = '# Managed by mailctl panel — do not edit by hand.\n';
  const blocks = accounts.map((a) => {
    const proto = a.protocol === 'pop3' ? 'POP3' : 'IMAP';
    const portPart = a.port ? ` port ${a.port}` : '';
    const opts = [a.ssl ? 'ssl' : '', a.keep ? 'keep' : 'nokeep'].filter(Boolean).join(' ');
    return (
      `poll ${q(a.pollServer)} protocol ${proto}${portPart}\n` +
      `  user ${q(a.username)} there with password ${q(a.password)} is ${q(a.destAddress)} here` +
      (opts ? `\n  ${opts}` : '')
    );
  });
  return blocks.length ? `${header}${blocks.join('\n\n')}\n` : header;
}
