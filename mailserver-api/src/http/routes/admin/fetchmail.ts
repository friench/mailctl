import { Router, type Request, type Response } from 'express';
import type { FetchmailService } from '../../../domain/fetchmail/service';
import { serializeFetchmail } from '../../../domain/fetchmail/serialize';
import { asyncHandler } from '../../../lib/async-handler';
import { createFetchmailSchema, updateFetchmailSchema } from '../../validators/fetchmail';

/**
 * Inbound fetching (fetchmail) — recurring pull from external IMAP/POP3 accounts
 * into local addresses. Global admin resource: needs remote credentials and
 * affects server-wide config. Passwords are stored encrypted and never returned.
 */
export function adminFetchmailRouter(service: FetchmailService) {
  const router = Router();

  router.get('/admin/api/fetchmail', (_req: Request, res: Response) => {
    res.json(service.list().map(serializeFetchmail));
  });

  router.post(
    '/admin/api/fetchmail',
    asyncHandler(async (req: Request, res: Response) => {
      const data = createFetchmailSchema.parse(req.body);
      const row = await service.create({ ...data, port: data.port ?? null });
      res.status(201).json(serializeFetchmail(row));
    }),
  );

  router.patch(
    '/admin/api/fetchmail/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const { active } = updateFetchmailSchema.parse(req.body);
      const row = await service.setActive(String(req.params.id ?? ''), active);
      res.json(serializeFetchmail(row));
    }),
  );

  router.delete(
    '/admin/api/fetchmail/:id',
    asyncHandler(async (req: Request, res: Response) => {
      await service.delete(String(req.params.id ?? ''));
      res.status(204).end();
    }),
  );

  return router;
}
