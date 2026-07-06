import { describe, it, expect } from 'vitest';
import { resolveDockerOptions } from '../../src/lib/docker';

describe('resolveDockerOptions', () => {
  it('uses the unix socket when DOCKER_HOST is unset', () => {
    expect(resolveDockerOptions({ DOCKER_SOCKET_PATH: '/var/run/docker.sock' })).toEqual({
      socketPath: '/var/run/docker.sock',
    });
  });

  it('parses a tcp DOCKER_HOST into host/port/protocol', () => {
    expect(
      resolveDockerOptions({
        DOCKER_HOST: 'tcp://docker-socket-proxy:2375',
        DOCKER_SOCKET_PATH: '/var/run/docker.sock',
      }),
    ).toEqual({ host: 'docker-socket-proxy', port: 2375, protocol: 'http' });
  });

  it('defaults the port and uses https for a tls DOCKER_HOST', () => {
    expect(
      resolveDockerOptions({ DOCKER_HOST: 'https://proxy', DOCKER_SOCKET_PATH: '/x' }),
    ).toEqual({ host: 'proxy', port: 2376, protocol: 'https' });
  });
});
