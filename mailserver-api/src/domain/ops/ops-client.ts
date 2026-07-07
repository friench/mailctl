import Docker from 'dockerode';
import type { Logger } from '../../logger';
import { execInContainer } from '../../lib/docker-exec';
import {
  parseDoveadmWho,
  parsePostqueue,
  type MailQueue,
  type Session,
} from '../../lib/ops-parsers';

/** Read-only operational data sourced from the docker-mailserver container. */
export interface OpsClient {
  /** Raw tail of the mail log (up to `lines` lines); '' when unavailable. */
  tailMailLog(lines: number): Promise<string>;
  mailQueue(): Promise<MailQueue>;
  sessions(): Promise<Session[]>;
}

export interface DockerodeOpsClientOptions {
  dockerOptions?: Docker.DockerOptions;
  dmsContainerName: string;
  mailLogPath: string;
  logger?: Logger;
}

export class DockerodeOpsClient implements OpsClient {
  private readonly docker: Docker;
  private readonly dmsContainerName: string;
  private readonly mailLogPath: string;
  private readonly logger: Logger | undefined;

  constructor(opts: DockerodeOpsClientOptions) {
    this.docker = new Docker(opts.dockerOptions ?? { socketPath: '/var/run/docker.sock' });
    this.dmsContainerName = opts.dmsContainerName;
    this.mailLogPath = opts.mailLogPath;
    this.logger = opts.logger;
  }

  async tailMailLog(lines: number): Promise<string> {
    const capped = Math.max(1, Math.min(lines, 5000));
    return (await this.execOrNull(['tail', '-n', String(capped), this.mailLogPath])) ?? '';
  }

  async mailQueue(): Promise<MailQueue> {
    const stdout = await this.execOrNull(['postqueue', '-p']);
    return stdout === null ? { entries: [], summary: null } : parsePostqueue(stdout);
  }

  async sessions(): Promise<Session[]> {
    const stdout = await this.execOrNull(['doveadm', 'who']);
    return stdout === null ? [] : parseDoveadmWho(stdout);
  }

  /** Exec a command in the DMS container; returns stdout, or null on failure. */
  private async execOrNull(cmd: string[]): Promise<string | null> {
    try {
      const { exitCode, stdout, stderr } = await execInContainer(
        this.docker,
        this.dmsContainerName,
        cmd,
      );
      if (exitCode !== 0) {
        this.logger?.debug({ cmd, exitCode, stderr }, 'ops exec non-zero');
        return null;
      }
      return stdout;
    } catch (err) {
      this.logger?.debug({ cmd, err }, 'ops exec failed');
      return null;
    }
  }
}
