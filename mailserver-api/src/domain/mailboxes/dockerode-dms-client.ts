import Docker from 'dockerode';
import { PassThrough } from 'node:stream';
import type { Logger } from '../../logger';
import { parseDkimFile } from '../../lib/dkim-parser';
import { parsePostfixVirtual } from '../../lib/postfix-virtual-parser';
import { parseDovecotQuotas } from '../../lib/dovecot-quotas-parser';
import type { DmsAlias, DmsClient, DmsDkim, DmsEmail, DmsQuota } from './dms-client';

export interface DockerodeDmsClientOptions {
  socketPath?: string;
  containerName: string;
  logger?: Logger;
}

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

  constructor(opts: DockerodeDmsClientOptions) {
    this.docker = new Docker({ socketPath: opts.socketPath ?? '/var/run/docker.sock' });
    this.containerName = opts.containerName;
    this.logger = opts.logger;
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

  private async runRaw(cmd: string[]): Promise<{ stdout: string; stderr: string }> {
    const container = this.docker.getContainer(this.containerName);
    const exec = await container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ hijack: true, stdin: false });

    const stdoutBuf: Buffer[] = [];
    const stderrBuf: Buffer[] = [];

    const stdout = new PassThrough();
    const stderr = new PassThrough();
    stdout.on('data', (c: Buffer) => stdoutBuf.push(c));
    stderr.on('data', (c: Buffer) => stderrBuf.push(c));

    this.docker.modem.demuxStream(stream, stdout, stderr);

    await new Promise<void>((resolve, reject) => {
      stream.on('end', () => resolve());
      stream.on('error', reject);
    });

    const inspect = await exec.inspect();
    const out = Buffer.concat(stdoutBuf).toString('utf-8');
    const err = Buffer.concat(stderrBuf).toString('utf-8');

    if (inspect.ExitCode !== 0) {
      const message = `${cmd[0]} ${cmd[1] ?? ''} exited ${inspect.ExitCode}: ${err.trim() || out.trim()}`;
      this.logger?.warn({ cmd, exitCode: inspect.ExitCode, stderr: err }, 'DMS exec failed');
      throw new Error(message);
    }

    return { stdout: out, stderr: err };
  }
}
