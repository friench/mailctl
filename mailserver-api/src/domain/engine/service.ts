import { BusinessError } from '../../lib/errors';
import type { DmsSetting, DoveadmStats, RspamdStat } from '../../lib/engine-parsers';
import type { ContainerStatus, EngineClient } from './engine-client';

export interface EngineServiceOptions {
  /** Containers the panel may inspect + restart (the mail stack). */
  containers: string[];
  /** Operator-configured link to the Rspamd web UI, if exposed. */
  rspamdUiUrl?: string | null;
}

export interface EngineOverview {
  rspamd: { enabled: boolean; uiUrl: string | null; stat: RspamdStat | null };
  dovecot: { stats: DoveadmStats };
  features: DmsSetting[];
  containers: ContainerStatus[];
}

/**
 * Read-only observability over the mail engine: Rspamd/Dovecot stats,
 * docker-mailserver feature toggles (`/etc/dms-settings`), and companion
 * container status — plus a guarded container restart.
 */
export class EngineService {
  constructor(
    private readonly client: EngineClient,
    private readonly opts: EngineServiceOptions,
  ) {}

  async overview(): Promise<EngineOverview> {
    const [stat, stats, features, containers] = await Promise.all([
      this.client.rspamdStat(),
      this.client.dovecotStats(),
      this.client.dmsSettings(),
      this.client.containerStatus(this.opts.containers),
    ]);

    const rspamdEnabled = features.find((f) => f.key === 'ENABLE_RSPAMD')?.enabled ?? stat !== null;

    return {
      rspamd: { enabled: rspamdEnabled, uiUrl: this.opts.rspamdUiUrl ?? null, stat },
      dovecot: { stats },
      features,
      containers,
    };
  }

  /** Restart one of the allow-listed stack containers. */
  async restartContainer(name: string): Promise<void> {
    if (!this.opts.containers.includes(name)) {
      throw new BusinessError(404, 'Unknown container');
    }
    await this.client.restartContainer(name);
  }
}
