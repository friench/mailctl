import { describe, it, expect } from 'vitest';
import type Docker from 'dockerode';
import { PassThrough } from 'node:stream';
import { execInContainer, DockerExecTimeoutError } from '../../src/lib/docker-exec';

interface FakeOpts {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  hang?: boolean;
  captureStdin?: (data: string) => void;
  onExecCreate?: (opts: { AttachStdin?: boolean; Cmd?: string[] }) => void;
}

/** Minimal dockerode stand-in driving execInContainer's stream contract. */
function fakeDocker(opts: FakeOpts): Docker {
  const hijacked = new PassThrough();
  const modem = {
    demuxStream(src: PassThrough, out: PassThrough, err: PassThrough) {
      if (opts.captureStdin) src.on('data', (c: Buffer) => opts.captureStdin!(c.toString()));
      if (opts.hang) return; // never ends → exercises the timeout path
      setImmediate(() => {
        if (opts.stdout) out.write(Buffer.from(opts.stdout));
        if (opts.stderr) err.write(Buffer.from(opts.stderr));
        setImmediate(() => src.emit('end'));
      });
    },
  };
  const container = {
    exec: async (execOpts: { AttachStdin?: boolean; Cmd?: string[] }) => {
      opts.onExecCreate?.(execOpts);
      return {
        start: async () => hijacked,
        inspect: async () => ({ ExitCode: opts.exitCode ?? 0 }),
      };
    },
  };
  return { getContainer: () => container, modem } as unknown as Docker;
}

describe('execInContainer', () => {
  it('collects stdout and the exit code on success', async () => {
    const docker = fakeDocker({ stdout: 'hello\n', exitCode: 0 });
    const res = await execInContainer(docker, 'c', ['echo', 'hello']);
    expect(res).toMatchObject({ exitCode: 0, stdout: 'hello\n', stderr: '' });
  });

  it('returns a non-zero exit code instead of throwing', async () => {
    const docker = fakeDocker({ stderr: 'nope\n', exitCode: 2 });
    const res = await execInContainer(docker, 'c', ['false']);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toBe('nope\n');
  });

  it('pipes stdin and sets AttachStdin', async () => {
    let seen = '';
    let attachStdin: boolean | undefined;
    const docker = fakeDocker({
      exitCode: 0,
      captureStdin: (d) => (seen += d),
      onExecCreate: (o) => (attachStdin = o.AttachStdin),
    });
    await execInContainer(docker, 'c', ['tee'], { stdin: 'payload' });
    expect(seen).toBe('payload');
    expect(attachStdin).toBe(true);
  });

  it('does not attach stdin when none is given', async () => {
    let attachStdin: boolean | undefined = true;
    const docker = fakeDocker({ exitCode: 0, onExecCreate: (o) => (attachStdin = o.AttachStdin) });
    await execInContainer(docker, 'c', ['ls']);
    expect(attachStdin).toBe(false);
  });

  it('interleaves stdout and stderr when combineStreams is set', async () => {
    const docker = fakeDocker({ stdout: 'out', stderr: 'err', exitCode: 0 });
    const res = await execInContainer(docker, 'c', ['x'], { combineStreams: true });
    expect(res.combined).toContain('out');
    expect(res.combined).toContain('err');
  });

  it('rejects with DockerExecTimeoutError when the exec hangs', async () => {
    const docker = fakeDocker({ hang: true });
    await expect(execInContainer(docker, 'c', ['sleep', '999'], { timeoutMs: 40 })).rejects.toThrow(
      DockerExecTimeoutError,
    );
  });

  it('does not time out when timeoutMs is 0', async () => {
    const docker = fakeDocker({ stdout: 'done', exitCode: 0 });
    const res = await execInContainer(docker, 'c', ['x'], { timeoutMs: 0 });
    expect(res.stdout).toBe('done');
  });
});
