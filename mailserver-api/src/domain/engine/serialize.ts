import type { EngineOverviewDTO } from '../../contracts';
import type { EngineOverview } from './service';

/** The domain shape already matches the DTO; this pins the contract at the boundary. */
export function serializeEngineOverview(overview: EngineOverview): EngineOverviewDTO {
  return {
    rspamd: overview.rspamd,
    dovecot: overview.dovecot,
    features: overview.features,
    containers: overview.containers,
  };
}
