import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Logger } from '../../logger';
import type { DomainRepository } from '../domains/repository';
import { renderMailVhost, vhostFileName } from '../../lib/nginx-templates';
import type { NginxReloader } from './reloader';

const VHOST_FILE_PREFIX = 'mail-';
const VHOST_FILE_SUFFIX = '.conf';

export interface NginxServiceOptions {
  generatedDir: string;
  reloader: NginxReloader;
  logger: Logger;
}

export interface RegenerateResult {
  written: string[];
  removed: string[];
  reloaded: boolean;
  reloadError: string | null;
}

/**
 * Owns the contents of `generatedDir`: writes one vhost file per active domain,
 * removes stale files, then asks the reloader to refresh nginx.
 */
export class NginxService {
  private readonly dir: string;
  private readonly reloader: NginxReloader;
  private readonly logger: Logger;

  constructor(
    private readonly domainRepo: DomainRepository,
    opts: NginxServiceOptions,
  ) {
    this.dir = resolve(opts.generatedDir);
    this.reloader = opts.reloader;
    this.logger = opts.logger;
  }

  async regenerate(): Promise<RegenerateResult> {
    mkdirSync(this.dir, { recursive: true });

    const activeDomains = this.domainRepo.list().filter((d) => d.active);
    const desired = new Map<string, string>();
    for (const d of activeDomains) {
      desired.set(vhostFileName(d.name), renderMailVhost(d.name));
    }

    const result: RegenerateResult = {
      written: [],
      removed: [],
      reloaded: false,
      reloadError: null,
    };

    // Write/refresh files
    for (const [filename, content] of desired) {
      writeFileSync(join(this.dir, filename), content, 'utf-8');
      result.written.push(filename);
    }

    // Remove stale generated files
    const existing = readdirSync(this.dir).filter(
      (f) => f.startsWith(VHOST_FILE_PREFIX) && f.endsWith(VHOST_FILE_SUFFIX),
    );
    for (const f of existing) {
      if (!desired.has(f)) {
        unlinkSync(join(this.dir, f));
        result.removed.push(f);
      }
    }

    this.logger.info(
      { dir: this.dir, written: result.written.length, removed: result.removed.length },
      'Regenerated nginx vhosts',
    );

    try {
      await this.reloader.reload();
      result.reloaded = true;
    } catch (err) {
      result.reloadError = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn({ err, dir: this.dir }, 'Nginx reload failed; configs are still on disk');
    }

    return result;
  }
}
