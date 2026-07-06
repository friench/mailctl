import Docker from 'dockerode';
import { PassThrough } from 'node:stream';
import type { Logger } from '../../logger';
import {
  parseDmsSettings,
  parseDoveadmStats,
  parseRspamcStat,
  type DmsSetting,
  type DoveadmStats,
  type RspamdStat,
} from '../../lib/engine-parsers';

/** Runtime status of one container in the mail stack. */
export interface ContainerStatus {
  name: string;
  /** Docker state (running, exited, restarting, …), or `missing` when absent. */
  state: string;
  health: string | null;
  image: string | null;
  startedAt: string | null;
}

/** Read-only engine observability + container control. Mockable for tests. */
export interface EngineClient {
  rspamdStat(): Promise<RspamdStat | null>;
  dovecotStats(): Promise<DoveadmStats>;
  dmsSettings(): Promise<DmsSetting[]>;
  containerStatus(names: string[]): Promise<ContainerStatus[]>;
  restartContainer(name: string): Promise<void>;
}

export interface DockerodeEngineClientOptions {
  dockerOptions?: Docker.DockerOptions;
  /** The docker-mailserver container to exec engine commands in. */
  dmsContainerName: string;
  logger?: Logger;
}

export class DockerodeEngineClient implements EngineClient {
  private readonly docker: Docker;
  private readonly dmsContainerName: string;
  private readonly logger: Logger | undefined;

  constructor(opts: DockerodeEngineClientOptions) {
    this.docker = new Docker(opts.dockerOptions ?? { socketPath: '/var/run/docker.sock' });
    this.dmsContainerName = opts.dmsContainerName;
    this.logger = opts.logger;
  }

  async rspamdStat(): Promise<RspamdStat | null> {
    const stdout = await this.execOrNull(['rspamc', 'stat']);
    return stdout === null ? null : parseRspamcStat(stdout);
  }

  async dovecotStats(): Promise<DoveadmStats> {
    const stdout = await this.execOrNull(['doveadm', 'stats', 'dump']);
    return stdout === null ? { columns: [], rows: [] } : parseDoveadmStats(stdout);
  }

  async dmsSettings(): Promise<DmsSetting[]> {
    const stdout = await this.execOrNull(['cat', '/etc/dms-settings']);
    return stdout === null ? [] : parseDmsSettings(stdout);
  }

  async containerStatus(names: string[]): Promise<ContainerStatus[]> {
    const out: ContainerStatus[] = [];
    for (const name of names) {
      try {
        const info = await this.docker.getContainer(name).inspect();
        out.push({
          name,
          state: info.State?.Status ?? 'unknown',
          health: info.State?.Health?.Status ?? null,
          image: info.Config?.Image ?? null,
          startedAt: info.State?.StartedAt ?? null,
        });
      } catch (err) {
        this.logger?.debug({ name, err }, 'containerStatus: inspect failed');
        out.push({ name, state: 'missing', health: null, image: null, startedAt: null });
      }
    }
    return out;
  }

  async restartContainer(name: string): Promise<void> {
    await this.docker.getContainer(name).restart();
    this.logger?.info({ name }, 'container restarted');
  }

  /** Exec a command in the DMS container; returns stdout, or null on failure. */
  private async execOrNull(cmd: string[]): Promise<string | null> {
    try {
      const container = this.docker.getContainer(this.dmsContainerName);
      const exec = await container.exec({ Cmd: cmd, AttachStdout: true, AttachStderr: true });
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
      if (inspect.ExitCode !== 0) {
        this.logger?.debug(
          { cmd, exitCode: inspect.ExitCode, stderr: Buffer.concat(stderrBuf).toString('utf-8') },
          'engine exec non-zero',
        );
        return null;
      }
      return Buffer.concat(stdoutBuf).toString('utf-8');
    } catch (err) {
      this.logger?.debug({ cmd, err }, 'engine exec failed');
      return null;
    }
  }
}
