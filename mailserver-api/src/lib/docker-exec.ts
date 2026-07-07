import type Docker from 'dockerode';
import { PassThrough } from 'node:stream';

/** Raised when an exec exceeds its deadline; the underlying stream is destroyed. */
export class DockerExecTimeoutError extends Error {
  constructor(
    readonly cmd: string[],
    readonly timeoutMs: number,
  ) {
    super(`docker exec timed out after ${timeoutMs}ms: ${cmd.join(' ')}`);
    this.name = 'DockerExecTimeoutError';
  }
}

export interface DockerExecOptions {
  /** Data piped to the command's stdin (enables AttachStdin). */
  stdin?: string;
  /** Also collect stdout+stderr interleaved in arrival order (for log output). */
  combineStreams?: boolean;
  /**
   * Abort the exec after this many ms (default 30s). A hung `doveadm`/`postqueue`
   * would otherwise pin the calling worker tick or HTTP request forever. Pass 0
   * to disable — only for legitimately long-running execs (e.g. mailbox sync).
   */
  timeoutMs?: number;
}

export interface DockerExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** stdout+stderr interleaved; equals stdout unless `combineStreams` was set. */
  combined: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Single implementation of "exec a command in a container, collect its output,
 * read the exit code". Every DMS/engine/ops/nginx/migration client used to carry
 * a near-identical copy; they now delegate here so stream handling and the
 * timeout live in one tested place. Never throws on a non-zero exit — the caller
 * decides its own policy (throw / return null / keep the log). Throws only on a
 * transport error or {@link DockerExecTimeoutError}.
 */
export async function execInContainer(
  docker: Docker,
  containerName: string,
  cmd: string[],
  opts: DockerExecOptions = {},
): Promise<DockerExecResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const withStdin = opts.stdin !== undefined;

  const container = docker.getContainer(containerName);
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdin: withStdin,
    AttachStdout: true,
    AttachStderr: true,
  });
  const stream = await exec.start({ hijack: true, stdin: withStdin });

  const stdoutBuf: Buffer[] = [];
  const stderrBuf: Buffer[] = [];
  const combinedBuf: Buffer[] = [];
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  stdout.on('data', (c: Buffer) => {
    stdoutBuf.push(c);
    if (opts.combineStreams) combinedBuf.push(c);
  });
  stderr.on('data', (c: Buffer) => {
    stderrBuf.push(c);
    if (opts.combineStreams) combinedBuf.push(c);
  });
  docker.modem.demuxStream(stream, stdout, stderr);

  if (withStdin) {
    stream.write(opts.stdin);
    stream.end();
  }

  let timer: NodeJS.Timeout | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      stream.on('end', () => resolve());
      stream.on('error', reject);
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          stream.destroy();
          reject(new DockerExecTimeoutError(cmd, timeoutMs));
        }, timeoutMs);
        timer.unref?.();
      }
    });
  } finally {
    if (timer) clearTimeout(timer);
  }

  const inspect = await exec.inspect();
  const out = Buffer.concat(stdoutBuf).toString('utf-8');
  const err = Buffer.concat(stderrBuf).toString('utf-8');
  return {
    exitCode: inspect.ExitCode ?? 1,
    stdout: out,
    stderr: err,
    combined: opts.combineStreams ? Buffer.concat(combinedBuf).toString('utf-8') : out,
  };
}
