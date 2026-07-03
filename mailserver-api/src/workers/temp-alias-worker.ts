import type { Logger } from '../logger';
import type { AliasService } from '../domain/aliases/service';
import { PollingWorker } from './polling-worker';

export interface TempAliasWorkerOptions {
  /** Interval between prune ticks. Defaults to 1h. */
  intervalMs?: number;
}

/** Periodically removes expired temporary aliases from docker-mailserver + the DB. */
export class TempAliasWorker extends PollingWorker {
  constructor(
    private readonly service: AliasService,
    logger: Logger,
    opts: TempAliasWorkerOptions = {},
  ) {
    super({
      name: 'Temp alias worker',
      intervalMs: opts.intervalMs ?? 60 * 60 * 1_000,
      logger,
      sleepFirst: true,
    });
  }

  protected async tick(): Promise<boolean> {
    const pruned = await this.service.pruneExpired();
    if (pruned > 0) this.logger.info({ pruned }, 'Pruned expired temp aliases');
    return false;
  }
}
