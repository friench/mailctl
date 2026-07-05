import { filterLogLines, type MailQueue, type Session } from '../../lib/ops-parsers';
import type { OpsClient } from './ops-client';

export interface LogQuery {
  lines?: number;
  query?: string | null;
}

export interface LogResult {
  lines: string[];
  query: string | null;
}

/** Read-only operational views: mail log tail/search, queue, and sessions. */
export class OpsService {
  constructor(private readonly client: OpsClient) {}

  async logs(opts: LogQuery = {}): Promise<LogResult> {
    const limit = Math.max(1, Math.min(opts.lines ?? 200, 2000));
    const query = opts.query?.trim() ? opts.query.trim() : null;
    // Over-fetch when filtering so a search can still fill `limit` matches.
    const raw = await this.client.tailMailLog(query ? 5000 : limit);
    return { lines: filterLogLines(raw, query, limit), query };
  }

  mailQueue(): Promise<MailQueue> {
    return this.client.mailQueue();
  }

  sessions(): Promise<Session[]> {
    return this.client.sessions();
  }
}
