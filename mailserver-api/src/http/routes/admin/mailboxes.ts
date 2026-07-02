import { Router, type Request, type Response } from 'express';
import type { MailboxService } from '../../../domain/mailboxes/service';
import { serializeMailbox } from '../../../domain/mailboxes/serialize';
import { asyncHandler } from '../../../lib/async-handler';
import {
  createMailboxSchema,
  updateMailboxSchema,
  updatePasswordSchema,
} from '../../validators/mailboxes';

export function adminMailboxesRouter(service: MailboxService) {
  const router = Router();

  router.get('/admin/api/mailboxes', (_req: Request, res: Response) => {
    res.json(service.list().map(serializeMailbox));
  });

  router.post(
    '/admin/api/mailboxes',
    asyncHandler(async (req: Request, res: Response) => {
      const data = createMailboxSchema.parse(req.body);
      const row = await service.create(data);
      res.status(201).json(serializeMailbox(row));
    }),
  );

  router.get('/admin/api/mailboxes/:id', (req: Request, res: Response) => {
    const row = service.findById(String(req.params.id ?? ''));
    if (!row) {
      res.status(404).json({ error: 'Mailbox not found' });
      return;
    }
    res.json(serializeMailbox(row));
  });

  router.patch(
    '/admin/api/mailboxes/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const data = updateMailboxSchema.parse(req.body);
      const row = await service.update(String(req.params.id ?? ''), data);
      res.json(serializeMailbox(row));
    }),
  );

  router.patch(
    '/admin/api/mailboxes/:id/password',
    asyncHandler(async (req: Request, res: Response) => {
      const data = updatePasswordSchema.parse(req.body);
      await service.updatePassword(String(req.params.id ?? ''), data.password);
      res.status(204).end();
    }),
  );

  router.delete(
    '/admin/api/mailboxes/:id',
    asyncHandler(async (req: Request, res: Response) => {
      await service.delete(String(req.params.id ?? ''));
      res.status(204).end();
    }),
  );

  return router;
}
