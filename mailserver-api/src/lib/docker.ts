import type Docker from 'dockerode';

export interface DockerConnectionEnv {
  /** e.g. `tcp://docker-socket-proxy:2375` — takes precedence when set. */
  DOCKER_HOST?: string;
  /** Fallback unix socket path (default `/var/run/docker.sock`). */
  DOCKER_SOCKET_PATH: string;
}

/**
 * Resolve dockerode connection options. When `DOCKER_HOST` is set (a `tcp://`
 * URL pointing at a docker-socket-proxy), connect over TCP so mail-api never
 * touches the raw, root-equivalent unix socket directly. Otherwise fall back to
 * the mounted socket.
 */
export function resolveDockerOptions(env: DockerConnectionEnv): Docker.DockerOptions {
  if (env.DOCKER_HOST) {
    const url = new URL(env.DOCKER_HOST);
    const secure = url.protocol === 'https:';
    return {
      host: url.hostname,
      port: url.port ? Number(url.port) : secure ? 2376 : 2375,
      protocol: secure ? 'https' : 'http',
    };
  }
  return { socketPath: env.DOCKER_SOCKET_PATH };
}
