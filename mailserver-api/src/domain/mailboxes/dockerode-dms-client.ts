import Docker from 'dockerode';
import type { Logger } from '../../logger';
import { execInContainer } from '../../lib/docker-exec';
import { parseDkimFile } from '../../lib/dkim-parser';
import { parsePostfixVirtual } from '../../lib/postfix-virtual-parser';
import { parseDovecotQuotas } from '../../lib/dovecot-quotas-parser';
import { countSearchResults, parseJunkFetch } from '../../lib/doveadm-parser';
import { ACCESS_PATHS, type AccessConfigFiles } from '../../lib/access-rules';
import type { DmsAlias, DmsClient, DmsDkim, DmsEmail, DmsQuota, JunkMessage } from './dms-client';

export interface DockerodeDmsClientOptions {
  /** dockerode connection (unix socket or docker-socket-proxy TCP). */
  dockerOptions?: Docker.DockerOptions;
  containerName: string;
  logger?: Logger;
  /** IMAP folder spam is filed into by the engine (docker-mailserver default: `Junk`). */
  spamMailbox?: string;
}

/** doveadm `fetch` field list backing {@link DockerodeDmsClient.listJunk}. */
const JUNK_FETCH_FIELDS =
  'uid guid size.physical date.received hdr.from hdr.subject hdr.x-spam-score';

const EMAIL_LIST_LINE_RE = /^\*\s+(\S+@\S+)/;
const DMS_CONFIG_DIR = '/tmp/docker-mailserver';
const DKIM_KEYS_DIR = `${DMS_CONFIG_DIR}/opendkim/keys`;
/** Line marker emitted before each DKIM txt file's contents by `listDkim`'s find. */
const DKIM_FILE_MARKER = '@@FILE@@';

/**
 * Parse the combined stdout of the single `find ... -exec echo @@FILE@@{} -exec cat {}`
 * exec used by {@link DockerodeDmsClient.listDkim}. The output is a sequence of
 * `@@FILE@@<path>\n<file contents>` blocks. For each block the domain/selector are
 * derived from the path (`.../opendkim/keys/<domain>/<selector>.txt`) and the public
 * key from {@link parseDkimFile}. Blocks that fail to parse are skipped (and warned).
 */
export function parseDkimFindOutput(stdout: string, logger?: Logger): DmsDkim[] {
  const out: DmsDkim[] = [];
  // Split on the marker; the first chunk is whatever preceded the first file (usually empty).
  const blocks = stdout.split(DKIM_FILE_MARKER).slice(1);
  for (const block of blocks) {
    const newlineIdx = block.indexOf('\n');
    if (newlineIdx < 0) continue;
    const path = block.slice(0, newlineIdx).trim();
    const content = block.slice(newlineIdx + 1);
    const parts = path.split('/');
    const file = parts[parts.length - 1] ?? '';
    const domain = parts[parts.length - 2] ?? '';
    const selector = file.replace(/\.txt$/, '');
    if (!domain || !selector) continue;
    try {
      out.push({ domain, selector, publicKey: parseDkimFile(content).publicKey });
    } catch (err) {
      logger?.warn({ domain, selector, err }, 'Failed to parse DKIM key during listDkim');
    }
  }
  return out;
}

export class DockerodeDmsClient implements DmsClient {
  private readonly docker: Docker;
  private readonly containerName: string;
  private readonly logger: Logger | undefined;
  private readonly spamMailbox: string;

  constructor(opts: DockerodeDmsClientOptions) {
    this.docker = new Docker(opts.dockerOptions ?? { socketPath: '/var/run/docker.sock' });
    this.containerName = opts.containerName;
    this.logger = opts.logger;
    this.spamMailbox = opts.spamMailbox ?? 'Junk';
  }

  async listEmails(): Promise<DmsEmail[]> {
    const { stdout } = await this.runSetup(['email', 'list']);
    return this.parseEmailList(stdout);
  }

  async addEmail(address: string, password: string): Promise<void> {
    await this.runSetup(['email', 'add', address, password]);
  }

  async updatePassword(address: string, password: string): Promise<void> {
    await this.runSetup(['email', 'update', address, password]);
  }

  async deleteEmail(address: string): Promise<void> {
    await this.runSetup(['email', 'del', '-y', address]);
  }

  async setQuota(address: string, megabytes: number): Promise<void> {
    await this.runSetup(['quota', 'set', address, `${megabytes}M`]);
  }

  async deleteQuota(address: string): Promise<void> {
    await this.runSetup(['quota', 'del', address]);
  }

  async setSendRestricted(address: string, restricted: boolean): Promise<void> {
    await this.runSetup(['email', 'restrict', restricted ? 'add' : 'del', 'send', address]);
  }

  async setReceiveRestricted(address: string, restricted: boolean): Promise<void> {
    await this.runSetup(['email', 'restrict', restricted ? 'add' : 'del', 'receive', address]);
  }

  async writeSieve(address: string, script: string): Promise<void> {
    const [local, domain] = address.toLowerCase().split('@');
    if (!local || !domain || !/^[a-z0-9._%+=-]+$/.test(local) || !/^[a-z0-9.-]+$/.test(domain)) {
      throw new Error(`Unsafe mailbox address for Sieve: ${address}`);
    }
    const home = `/var/mail/${domain}/${local}/home`;
    const file = `${home}/.dovecot.sieve`;
    // No shell: mkdir the Dovecot home, tee the script from stdin, then hand the
    // file to the vmail user so Dovecot can compile it (best-effort).
    await this.runRaw(['mkdir', '-p', home]);
    await this.runRawWithInput(['tee', file], script);
    await this.runRaw(['chown', '5000:5000', file]).catch(() => undefined);
  }

  async listJunk(address: string): Promise<JunkMessage[]> {
    // `doveadm fetch` errors when the Junk folder does not exist yet (a mailbox
    // that has never received spam) — treat that as an empty quarantine.
    let stdout: string;
    try {
      ({ stdout } = await this.runRaw([
        'doveadm',
        'fetch',
        '-u',
        address,
        JUNK_FETCH_FIELDS,
        'mailbox',
        this.spamMailbox,
      ]));
    } catch (err) {
      this.logger?.debug({ address, err }, 'listJunk: no Junk folder / fetch failed');
      return [];
    }
    return parseJunkFetch(stdout);
  }

  async readJunkMessage(address: string, uid: number): Promise<string> {
    const { stdout } = await this.runRaw([
      'doveadm',
      'fetch',
      '-u',
      address,
      'text',
      'mailbox',
      this.spamMailbox,
      'uid',
      String(uid),
    ]);
    // The single `text` field is printed as `text: <full message>`; drop the key.
    return stdout.replace(/^text: ?/, '');
  }

  async releaseJunk(address: string, uid: number): Promise<void> {
    await this.runRaw([
      'doveadm',
      'move',
      '-u',
      address,
      'INBOX',
      'mailbox',
      this.spamMailbox,
      'uid',
      String(uid),
    ]);
  }

  async deleteJunk(address: string, uid: number): Promise<void> {
    await this.runRaw([
      'doveadm',
      'expunge',
      '-u',
      address,
      'mailbox',
      this.spamMailbox,
      'uid',
      String(uid),
    ]);
  }

  async purgeJunkOlderThan(address: string, days: number): Promise<number> {
    const query = ['mailbox', this.spamMailbox, 'savedbefore', `${days}d`];
    let count = 0;
    try {
      const { stdout } = await this.runRaw(['doveadm', 'search', '-u', address, ...query]);
      count = countSearchResults(stdout);
    } catch (err) {
      this.logger?.debug({ address, err }, 'purgeJunkOlderThan: search failed');
      return 0;
    }
    if (count === 0) return 0;
    await this.runRaw(['doveadm', 'expunge', '-u', address, ...query]);
    return count;
  }

  async writeAccessConfig(files: AccessConfigFiles): Promise<void> {
    // Ensure the Rspamd config subdirs exist (present only when Rspamd is enabled;
    // creating them is harmless otherwise).
    await this.runRaw(['mkdir', '-p', `${ACCESS_PATHS.rspamdDir}/override.d`]);
    await this.runRaw(['mkdir', '-p', `${ACCESS_PATHS.rspamdDir}/local.d`]);

    const writes: Array<[string, string]> = [
      [ACCESS_PATHS.postfixSender, files.postfixSender],
      [ACCESS_PATHS.postfixClient, files.postfixClient],
      [ACCESS_PATHS.postfixMainCf, files.postfixMainCf],
      [ACCESS_PATHS.rspamdFromBlock, files.rspamdFromBlock],
      [ACCESS_PATHS.rspamdFromAllow, files.rspamdFromAllow],
      [ACCESS_PATHS.rspamdIpBlock, files.rspamdIpBlock],
      [ACCESS_PATHS.rspamdIpAllow, files.rspamdIpAllow],
      [ACCESS_PATHS.rspamdConf, files.rspamdConf],
      [ACCESS_PATHS.rspamdRcptLua, files.rspamdRcptLua],
    ];
    for (const [path, content] of writes) {
      await this.runRawWithInput(['tee', path], content);
    }

    // Apply: reload Postfix (picks up main.cf + texthash maps) and Rspamd
    // (re-reads multimap.conf / Lua). Both are best-effort — a stack without
    // Rspamd simply has no service to reload.
    await this.runRaw(['postfix', 'reload']).catch((err) =>
      this.logger?.warn({ err }, 'writeAccessConfig: postfix reload failed'),
    );
    await this.runRaw(['supervisorctl', 'restart', 'rspamd']).catch((err) =>
      this.logger?.debug({ err }, 'writeAccessConfig: rspamd restart skipped'),
    );
  }

  async writeFetchmailConfig(content: string): Promise<void> {
    await this.runRawWithInput(['tee', '/tmp/docker-mailserver/fetchmail.cf'], content);
    // fetchmail re-reads its rc on the next poll; restart to apply promptly.
    // Best-effort — absent when ENABLE_FETCHMAIL=0.
    await this.runRaw(['supervisorctl', 'restart', 'fetchmail']).catch((err) =>
      this.logger?.debug({ err }, 'writeFetchmailConfig: fetchmail restart skipped'),
    );
  }

  async generateDkim(domain: string, selector: string, keysize: 2048 | 4096): Promise<void> {
    await this.runSetup([
      'config',
      'dkim',
      'keysize',
      String(keysize),
      'selector',
      selector,
      'domain',
      domain,
    ]);
  }

  async readDkimPublicKey(domain: string, selector: string): Promise<string> {
    const path = `${DKIM_KEYS_DIR}/${domain}/${selector}.txt`;
    const { stdout } = await this.runRaw(['cat', path]);
    return parseDkimFile(stdout).publicKey;
  }

  async listAliases(): Promise<DmsAlias[]> {
    const content = await this.readFileOrNull(`${DMS_CONFIG_DIR}/postfix-virtual.cf`);
    return content ? parsePostfixVirtual(content) : [];
  }

  async addAlias(address: string, target: string): Promise<void> {
    await this.runSetup(['alias', 'add', address, target]);
  }

  async deleteAlias(address: string, target: string): Promise<void> {
    await this.runSetup(['alias', 'del', address, target]);
  }

  async listQuotas(): Promise<DmsQuota[]> {
    const content = await this.readFileOrNull(`${DMS_CONFIG_DIR}/dovecot-quotas.cf`);
    return content ? parseDovecotQuotas(content) : [];
  }

  async listDkim(): Promise<DmsDkim[]> {
    // Single container exec: emit every DKIM txt file's path (prefixed with the
    // @@FILE@@ marker) followed by its contents. `find` exits non-zero / empty
    // when the keys dir is missing, which we tolerate by returning [].
    let stdout: string;
    try {
      ({ stdout } = await this.runRaw([
        'find',
        DKIM_KEYS_DIR,
        '-type',
        'f',
        '-name',
        '*.txt',
        '-exec',
        'echo',
        '@@FILE@@{}',
        ';',
        '-exec',
        'cat',
        '{}',
        ';',
      ]));
    } catch {
      return [];
    }
    return parseDkimFindOutput(stdout, this.logger);
  }

  /** `cat` a file inside the container; returns null if it does not exist. */
  private async readFileOrNull(path: string): Promise<string | null> {
    try {
      const { stdout } = await this.runRaw(['cat', path]);
      return stdout;
    } catch {
      return null;
    }
  }

  private parseEmailList(output: string): DmsEmail[] {
    const emails: DmsEmail[] = [];
    for (const rawLine of output.split('\n')) {
      const m = rawLine.trim().match(EMAIL_LIST_LINE_RE);
      if (m && m[1]) emails.push({ address: m[1] });
    }
    return emails;
  }

  private async runSetup(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return this.runRaw(['setup', ...args]);
  }

  /** Like {@link runRaw} but pipes `input` to the command's stdin. */
  private async runRawWithInput(
    cmd: string[],
    input: string,
  ): Promise<{ stdout: string; stderr: string }> {
    const { exitCode, stdout, stderr } = await execInContainer(
      this.docker,
      this.containerName,
      cmd,
      {
        stdin: input,
      },
    );
    if (exitCode !== 0) {
      this.logger?.warn({ cmd, exitCode, stderr }, 'DMS exec (stdin) failed');
      throw new Error(`${cmd[0]} exited ${exitCode}: ${stderr.trim() || stdout.trim()}`);
    }
    return { stdout, stderr };
  }

  private async runRaw(cmd: string[]): Promise<{ stdout: string; stderr: string }> {
    const { exitCode, stdout, stderr } = await execInContainer(
      this.docker,
      this.containerName,
      cmd,
    );
    if (exitCode !== 0) {
      const message = `${cmd[0]} ${cmd[1] ?? ''} exited ${exitCode}: ${stderr.trim() || stdout.trim()}`;
      this.logger?.warn({ cmd, exitCode, stderr }, 'DMS exec failed');
      throw new Error(message);
    }
    return { stdout, stderr };
  }
}
