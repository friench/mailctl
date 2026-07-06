import { Router, type Request, type Response } from 'express';
import type { MailSender } from '../../domain/send/mailer';
import type { ApiKeyService } from '../../domain/apikeys/service';
import type { SuppressionService } from '../../domain/suppressions/service';
import type { SendJobService } from '../../domain/queue/service';
import { serializeSendJobSummary } from '../../domain/queue/serialize';
import type { Logger } from '../../logger';
import { sendBodySchema } from '../validators/send';
import { createSendRateLimit } from '../middleware/rate-limit';
import { createApiKeyAuth } from '../middleware/auth';
import { requireScope } from '../middleware/scope';
import { asyncHandler } from '../../lib/async-handler';

function isWaitFlag(value: unknown): boolean {
  return value === 'true' || value === '1' || value === '';
}

export function sendRouter(
  mailer: MailSender,
  queueService: SendJobService,
  apiKeyService: ApiKeyService,
  suppressionService: SuppressionService,
  logger: Logger,
) {
  const router = Router();
  const auth = createApiKeyAuth(apiKeyService, logger);

  router.post(
    '/send',
    createSendRateLimit(),
    auth,
    requireScope('send'),
    asyncHandler(async (req: Request, res: Response) => {
      const { from, to, subject, html, text, replyTo, attachments } = sendBodySchema.parse(
        req.body,
      );
      if (from) {
        const fromError = mailer.validateFrom(from);
        if (fromError) {
          res.status(400).json({ error: fromError });
          return;
        }
      }

      // Suppression: block delivery to suppressed recipients unless this key is
      // exempt. Reject the whole send (don't partially deliver) so it's explicit.
      if (!req.apiKey?.suppressionExempt) {
        const suppressed = suppressionService.filterSuppressed(to.split(','));
        if (suppressed.length > 0) {
          res.status(422).json({
            error: 'One or more recipients are suppressed',
            suppressed: suppressed.map((s) => ({ address: s.address, reason: s.reason })),
          });
          return;
        }
      }

      const job = queueService.enqueue({
        payload: {
          to,
          subject,
          html,
          ...(from ? { from } : {}),
          ...(text ? { text } : {}),
          ...(replyTo ? { replyTo } : {}),
          ...(attachments ? { attachments } : {}),
        },
        apiKeyId: req.apiKey?.id ?? null,
      });

      if (isWaitFlag(req.query.wait)) {
        const finalJob = await queueService.processSpecific(job.id);
        const httpStatus =
          finalJob.status === 'done' ? 200 : finalJob.status === 'dead' ? 502 : 202;
        res.status(httpStatus).json({
          ok: finalJob.status === 'done',
          ...serializeSendJobSummary(finalJob),
        });
        return;
      }

      res.status(202).json({ ok: true, ...serializeSendJobSummary(job) });
    }),
  );

  return router;
}
