import Docker from 'dockerode';
import type { Logger } from '../../logger';
import { execInContainer } from '../../lib/docker-exec';

export interface NginxReloader {
  reload(): Promise<void>;
}

export interface DockerodeNginxReloaderOptions {
  dockerOptions?: Docker.DockerOptions;
  containerName: string;
  logger?: Logger;
}

export class DockerodeNginxReloader implements NginxReloader {
  private readonly docker: Docker;
  private readonly containerName: string;
  private readonly logger: Logger | undefined;

  constructor(opts: DockerodeNginxReloaderOptions) {
    this.docker = new Docker(opts.dockerOptions ?? { socketPath: '/var/run/docker.sock' });
    this.containerName = opts.containerName;
    this.logger = opts.logger;
  }

  async reload(): Promise<void> {
    const { exitCode, stderr } = await execInContainer(this.docker, this.containerName, [
      'nginx',
      '-s',
      'reload',
    ]);
    if (exitCode !== 0) {
      throw new Error(`nginx reload exited ${exitCode}: ${stderr.trim()}`);
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
