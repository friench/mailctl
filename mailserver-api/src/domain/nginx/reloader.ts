import Docker from 'dockerode';
import { PassThrough } from 'node:stream';
import type { Logger } from '../../logger';

export interface NginxReloader {
  reload(): Promise<void>;
}

export interface DockerodeNginxReloaderOptions {
  socketPath?: string;
  containerName: string;
  logger?: Logger;
}

export class DockerodeNginxReloader implements NginxReloader {
  private readonly docker: Docker;
  private readonly containerName: string;
  private readonly logger: Logger | undefined;

  constructor(opts: DockerodeNginxReloaderOptions) {
    this.docker = new Docker({ socketPath: opts.socketPath ?? '/var/run/docker.sock' });
    this.containerName = opts.containerName;
    this.logger = opts.logger;
  }

  async reload(): Promise<void> {
    const container = this.docker.getContainer(this.containerName);
    const exec = await container.exec({
      Cmd: ['nginx', '-s', 'reload'],
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
    if (inspect.ExitCode !== 0) {
      const err = Buffer.concat(stderrBuf).toString('utf-8').trim();
      throw new Error(`nginx reload exited ${inspect.ExitCode}: ${err}`);
    }
    this.logger?.info('nginx reloaded');
  }
}

/** No-op reloader. Use when nginx isn't reachable (local dev without nginx). */
export class NullNginxReloader implements NginxReloader {
  constructor(private readonly logger?: Logger) {}
  async reload(): Promise<void> {
    this.logger?.debug('NullNginxReloader: skipping reload');
  }
}
