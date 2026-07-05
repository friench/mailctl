import type { ContainerStatus, EngineClient } from '../../src/domain/engine/engine-client';
import type { DmsSetting, DoveadmStats, RspamdStat } from '../../src/lib/engine-parsers';

/** In-memory EngineClient for tests. Seed the public fields; inspect `restarts`. */
export class FakeEngineClient implements EngineClient {
  public stat: RspamdStat | null = null;
  public stats: DoveadmStats = { columns: [], rows: [] };
  public settings: DmsSetting[] = [];
  public containers = new Map<string, ContainerStatus>();
  public restarts: string[] = [];
  public errors: Partial<Record<keyof EngineClient, Error>> = {};

  async rspamdStat(): Promise<RspamdStat | null> {
    if (this.errors.rspamdStat) throw this.errors.rspamdStat;
    return this.stat;
  }

  async dovecotStats(): Promise<DoveadmStats> {
    if (this.errors.dovecotStats) throw this.errors.dovecotStats;
    return this.stats;
  }

  async dmsSettings(): Promise<DmsSetting[]> {
    if (this.errors.dmsSettings) throw this.errors.dmsSettings;
    return this.settings;
  }

  async containerStatus(names: string[]): Promise<ContainerStatus[]> {
    if (this.errors.containerStatus) throw this.errors.containerStatus;
    return names.map(
      (name) =>
        this.containers.get(name) ?? {
          name,
          state: 'missing',
          health: null,
          image: null,
          startedAt: null,
        },
    );
  }

  async restartContainer(name: string): Promise<void> {
    if (this.errors.restartContainer) throw this.errors.restartContainer;
    this.restarts.push(name);
  }
}
