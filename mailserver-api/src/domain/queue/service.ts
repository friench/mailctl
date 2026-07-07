import { BusinessError } from '../../lib/errors';
import { sendCompletedTotal, sendFailedTotal } from '../../lib/metrics';
import type { Logger } from '../../logger';
import type { MailSender } from '../send/mailer';
import { PermanentSendError } from '../send/types';
import type { SendJobPayload, SendJobRow } from '../../db/schema';
import type { EventDispatcher } from '../events/types';
import { NOOP_DISPATCHER } from '../events/types';
import type { SendJobRepository } from './repository';

const BASE_BACKOFF_MS = 30_000;

export function computeBackoffMs(attempts: number): number {
  // attempts is post-increment: 1st failure → 30s, 2nd → 60s, 3rd → 120s, etc.
  return BASE_BACKOFF_MS * Math.pow(2, Math.max(0, attempts - 1));
}

export interface EnqueueInput {
  payload: SendJobPayload;
  apiKeyId?: string | null;
  maxAttempts?: number;
}

export class SendJobService {
  constructor(
    private readonly repo: SendJobRepository,
    private readonly mailer: MailSender,
    private readonly logger: Logger,
    private readonly events: EventDispatcher = NOOP_DISPATCHER,
  ) {}

  enqueue(input: EnqueueInput): SendJobRow {
    return this.repo.create(input);
  }

  findById(id: string): SendJobRow | undefined {
    return this.repo.findById(id);
  }

  list(opts: { apiKeyId?: string | null; limit?: number } = {}): SendJobRow[] {
    return this.repo.list(opts);
  }

  /** Worker tick: claim and process the next ready job. Returns true if work was done. */
  async processOne(now: Date = new Date()): Promise<boolean> {
    const job = this.repo.claimNextPending(now);
    if (!job) return false;
    await this.processClaimedJob(job);
    return true;
  }

  /** For synchronous send: process this exact job inline. Returns the final row state. */
  async processSpecific(id: string, now: Date = new Date()): Promise<SendJobRow> {
    const existing = this.repo.findById(id);
    if (!existing) throw new BusinessError(404, 'Job not found');
    if (existing.status !== 'pending') return existing;

    const claimed = this.repo.claimById(id, now);
    if (!claimed) {
      // Race: another worker grabbed it.
      const after = this.repo.findById(id);
      if (!after) throw new BusinessError(404, 'Job not found');
      return after;
    }

    await this.processClaimedJob(claimed);
    return this.repo.findById(id)!;
  }

  /** Run on startup: recover jobs left in 'processing' from a crashed worker. */
  recoverStuckJobs(): number {
    const count = this.repo.resetProcessingToPending();
    if (count > 0) {
      this.logger.warn({ count }, 'Recovered stuck send jobs from previous run');
    }
    return count;
  }

  private async processClaimedJob(job: SendJobRow): Promise<void> {
    try {
      const result = await this.mailer.send({
        to: job.payload.to,
        subject: job.payload.subject,
        html: job.payload.html,
        from: job.payload.from,
        text: job.payload.text,
        replyTo: job.payload.replyTo,
        attachments: job.payload.attachments,
      });
      this.repo.markDone(job.id, { account: result.account, messageId: result.messageId });
      sendCompletedTotal.inc();
      this.logger.info(
        { jobId: job.id, account: result.account, messageId: result.messageId },
        'Send job done',
      );
      this.events.dispatch('send.completed', {
        jobId: job.id,
        to: job.payload.to,
        subject: job.payload.subject,
        account: result.account,
        messageId: result.messageId,
        attempts: job.attempts,
      });
    } catch (err) {
      const error = err as Error;
      // A permanent (5xx) failure won't be fixed by retrying — dead-letter now,
      // regardless of how many attempts remain.
      const isLastAttempt = err instanceof PermanentSendError || job.attempts >= job.maxAttempts;

      if (isLastAttempt) {
        this.repo.markDead(job.id, error.message);
        sendFailedTotal.inc();
        this.logger.error(
          { jobId: job.id, attempts: job.attempts, err: error.message },
          'Send job dead-lettered',
        );
        this.events.dispatch('send.failed', {
          jobId: job.id,
          to: job.payload.to,
          subject: job.payload.subject,
          attempts: job.attempts,
          error: error.message,
        });
      } else {
        const backoffMs = computeBackoffMs(job.attempts);
        const nextAt = new Date(Date.now() + backoffMs);
        this.repo.rescheduleForRetry(job.id, error.message, nextAt);
        this.logger.warn(
          { jobId: job.id, attempts: job.attempts, nextAt, err: error.message },
          'Send job retrying',
        );
      }
    }
  }
}
