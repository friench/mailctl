import type { OpsClient } from '../../src/domain/ops/ops-client';
import type { MailQueue, Session } from '../../src/lib/ops-parsers';

/** In-memory OpsClient for tests. Seed the public fields. */
export class FakeOpsClient implements OpsClient {
  public log = '';
  public queue: MailQueue = { entries: [], summary: null };
  public who: Session[] = [];

  async tailMailLog(): Promise<string> {
    return this.log;
  }

  async mailQueue(): Promise<MailQueue> {
    return this.queue;
  }

  async sessions(): Promise<Session[]> {
    return this.who;
  }
}
