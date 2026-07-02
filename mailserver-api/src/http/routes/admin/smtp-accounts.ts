import { Router, type Request, type Response } from 'express';
import type { SmtpAccountService } from '../../../domain/smtp-accounts/service';
import { serializeSmtpAccount } from '../../../domain/smtp-accounts/serialize';
import { asyncHandler } from '../../../lib/async-handler';
import { createSmtpAccountSchema, updateSmtpAccountSchema } from '../../validators/smtp-accounts';

export function adminSmtpAccountsRouter(service: SmtpAccountService) {
  const router = Router();

  router.get('/admin/api/smtp-accounts', (_req: Request, res: Response) => {
    res.json(service.list().map(serializeSmtpAccount));
  });

  router.post(
    '/admin/api/smtp-accounts',
    asyncHandler(async (req: Request, res: Response) => {
      const data = createSmtpAccountSchema.parse(req.body);
      const row = service.create(data);
      res.status(201).json(serializeSmtpAccount(row));
    }),
  );

  router.get('/admin/api/smtp-accounts/:id', (req: Request, res: Response) => {
    const row = service.findById(String(req.params.id ?? ''));
    if (!row) {
      res.status(404).json({ error: 'SMTP account not found' });
      return;
    }
    res.json(serializeSmtpAccount(row));
  });

  router.patch(
    '/admin/api/smtp-accounts/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const data = updateSmtpAccountSchema.parse(req.body);
      const row = service.update(String(req.params.id ?? ''), data);
      res.json(serializeSmtpAccount(row));
    }),
  );

  router.delete(
    '/admin/api/smtp-accounts/:id',
    asyncHandler(async (req: Request, res: Response) => {
      service.delete(String(req.params.id ?? ''));
      res.status(204).end();
    }),
  );

  return router;
}
