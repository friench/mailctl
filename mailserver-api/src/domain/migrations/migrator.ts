import Docker from 'dockerode';
import { PassThrough } from 'node:stream';
import type { Logger } from '../../logger';
import type { ImapSslMode } from '../../db/schema';

export interface MigrationParams {
  sourceHost: string;
  sourcePort: number;
  sourceUser: string;
  sourcePassword: string;
  sourceSsl: ImapSslMode;
  destAddress: string;
}

export interface MigrationResult {
  ok: boolean;
  /** Combined stdout+stderr of the sync, for the per-job log. */
  log: string;
}

/** Runs a one-shot IMAP import for a single mailbox. Mockable for tests. */
export interface Migrator {
  run(params: MigrationParams): Promise<MigrationResult>;
}

export interface DoveadmMigratorOptions {
  socketPath?: string;
  dmsContainerName: string;
  logger?: Logger;
}

/** doveadm `imapc_ssl` accepts `no`/`imaps`/`starttls`. */
function imapcSsl(mode: ImapSslMode): string {
  return mode === 'none' ? 'no' : mode;
}

/**
 * Migrator backed by Dovecot dsync: `doveadm backup -R -u <dest> imapc:` inside
 * the docker-mailserver container, with the source connection supplied through
 * `-o imapc_*` overrides. `-R` (reverse) makes the local mailbox a copy of the
 * remote — idempotent, so re-running a job is safe.
 */
export class DoveadmMigrator implements Migrator {
  private readonly docker: Docker;
  private readonly dmsContainerName: string;
  private readonly logger: Logger | undefined;

  constructor(opts: DoveadmMigratorOptions) {
    this.docker = new Docker({ socketPath: opts.socketPath ?? '/var/run/docker.sock' });
    this.dmsContainerName = opts.dmsContainerName;
    this.logger = opts.logger;
  }

  async run(params: MigrationParams): Promise<MigrationResult> {
    // NOTE: the source password is passed as an `-o` argument; it is visible in
    // the container's process list for the duration of this short-lived exec.
    const cmd = [
      'doveadm',
      '-o',
      `imapc_host=${params.sourceHost}`,
      '-o',
      `imapc_port=${params.sourcePort}`,
      '-o',
      `imapc_user=${params.sourceUser}`,
      '-o',
      `imapc_password=${params.sourcePassword}`,
      '-o',
      `imapc_ssl=${imapcSsl(params.sourceSsl)}`,
      'backup',
      '-R',
      '-u',
      params.destAddress,
      'imapc:',
    ];

    try {
      const { exitCode, output } = await this.exec(cmd);
      return { ok: exitCode === 0, log: output.trim() };
    } catch (err) {
      this.logger?.warn({ err, dest: params.destAddress }, 'migration exec failed');
      return { ok: false, log: err instanceof Error ? err.message : String(err) };
    }
  }

  private async exec(cmd: string[]): Promise<{ exitCode: number; output: string }> {
    const container = this.docker.getContainer(this.dmsContainerName);
    const exec = await container.exec({ Cmd: cmd, AttachStdout: true, AttachStderr: true });
    const stream = await exec.start({ hijack: true, stdin: false });

    const chunks: Buffer[] = [];
    const sink = new PassThrough();
    sink.on('data', (c: Buffer) => chunks.push(c));
    // Multiplex both streams into one buffer so the log preserves ordering.
    this.docker.modem.demuxStream(stream, sink, sink);

    await new Promise<void>((resolve, reject) => {
      stream.on('end', () => resolve());
      stream.on('error', reject);
    });

    const inspect = await exec.inspect();
    return { exitCode: inspect.ExitCode ?? 1, output: Buffer.concat(chunks).toString('utf-8') };
  }
}
