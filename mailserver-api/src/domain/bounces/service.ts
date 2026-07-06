import { BusinessError } from '../../lib/errors';
import type { Logger } from '../../logger';
import { parseDsn } from '../../lib/dsn-parser';
import type { BounceEventRow } from '../../db/schema';
import type { SendJobRepository } from '../queue/repository';
import type { EventDispatcher } from '../events/types';
import { NOOP_DISPATCHER } from '../events/types';
import type { SuppressionService } from '../suppressions/service';
import type { BounceRepository } from './repository';

export interface IngestResult {
  recorded: number;
  events: BounceEventRow[];
}

/**
 * Captures delivery-status notifications (bounces). {@link ingest} parses a raw
 * DSN email, records one bounce event per failed recipient, correlates it to the
 * originating send job via the message id, and fans out a `send.bounced` event.
 * The ingest endpoint is the capture API — a mail-router pipe or forwarder feeds
 * bounce emails to it (see _docs).
 */
export class BounceService {
  constructor(
    private readonly repo: BounceRepository,
    private readonly sendJobRepo: SendJobRepository,
    private readonly logger: Logger,
    private readonly events: EventDispatcher = NOOP_DISPATCHER,
    private readonly suppressions?: SuppressionService,
  ) {}

  ingest(raw: string): IngestResult {
    const dsn = parseDsn(raw);
    if (!dsn) throw new BusinessError(422, 'Not a delivery-status notification');

    const job = dsn.originalMessageId
      ? this.sendJobRepo.findByMessageId(dsn.originalMessageId)
      : undefined;

    const events: BounceEventRow[] = [];
    for (const r of dsn.recipients) {
      const row = this.repo.create({
        sendJobId: job?.id ?? null,
        recipient: r.recipient,
        type: 'bounce',
        classification: r.classification,
        statusCode: r.statusCode,
        diagnostic: r.diagnostic,
        originalMessageId: dsn.originalMessageId,
      });
      events.push(row);
      // A hard bounce means the address is undeliverable — auto-suppress it.
      if (r.classification === 'hard') {
        this.suppressions?.addFromBounce(r.recipient, row.id);
      }
      this.events.dispatch('send.bounced', {
        bounceId: row.id,
        sendJobId: row.sendJobId,
        recipient: row.recipient,
        classification: row.classification,
        statusCode: row.statusCode,
        messageId: dsn.originalMessageId,
      });
    }

    this.logger.info(
      { recorded: events.length, correlated: !!job, messageId: dsn.originalMessageId },
      'Bounce(s) captured',
    );
    return { recorded: events.length, events };
  }

  list(): BounceEventRow[] {
    return this.repo.list();
  }
}
