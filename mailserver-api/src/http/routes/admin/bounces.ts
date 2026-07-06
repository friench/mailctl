import { Router, text, type Request, type Response } from 'express';
import type { BounceService } from '../../../domain/bounces/service';
import { serializeBounce } from '../../../domain/bounces/serialize';
import { asyncHandler } from '../../../lib/async-handler';

/**
 * Bounce / delivery-feedback capture. Admin-scoped. The ingest endpoint accepts
 * a raw DSN email — as a `text/*` / `message/rfc822` body, or JSON `{ raw }` —
 * parses it, records a bounce event per failed recipient, and correlates it to
 * the originating send job.
 */
export function adminBouncesRouter(service: BounceService) {
  const router = Router();

  router.get('/admin/api/bounces', (_req: Request, res: Response) => {
    res.json(service.list().map(serializeBounce));
  });

  router.post(
    '/admin/api/bounces/ingest',
    text({ type: ['text/*', 'message/*', 'application/octet-stream'], limit: '5mb' }),
    asyncHandler(async (req: Request, res: Response) => {
      const raw =
        typeof req.body === 'string'
          ? req.body
          : typeof (req.body as { raw?: unknown })?.raw === 'string'
            ? (req.body as { raw: string }).raw
            : '';
      if (!raw.trim()) {
        res.status(400).json({ error: 'Empty bounce payload' });
        return;
      }
      const result = service.ingest(raw);
      res
        .status(201)
        .json({ recorded: result.recorded, events: result.events.map(serializeBounce) });
    }),
  );

  return router;
}
