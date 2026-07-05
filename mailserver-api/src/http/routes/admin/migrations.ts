import { Router, type Request, type Response } from 'express';
import type { MigrationService } from '../../../domain/migrations/service';
import { serializeMigration, serializeMigrationDetail } from '../../../domain/migrations/serialize';
import { asyncHandler } from '../../../lib/async-handler';
import { createMigrationSchema } from '../../validators/migrations';

/**
 * One-shot IMAP migration jobs. Global admin resource: a job imports an external
 * mailbox into a local address and needs the source credentials. The source
 * password is accepted here, stored encrypted, and never returned.
 */
export function adminMigrationsRouter(service: MigrationService) {
  const router = Router();

  router.get('/admin/api/migrations', (_req: Request, res: Response) => {
    res.json(service.list().map(serializeMigration));
  });

  router.post('/admin/api/migrations', (req: Request, res: Response) => {
    const data = createMigrationSchema.parse(req.body);
    const row = service.create(data);
    res.status(201).json(serializeMigration(row));
  });

  router.get('/admin/api/migrations/:id', (req: Request, res: Response) => {
    const row = service.findById(String(req.params.id ?? ''));
    if (!row) {
      res.status(404).json({ error: 'Migration not found' });
      return;
    }
    res.json(serializeMigrationDetail(row));
  });

  router.delete(
    '/admin/api/migrations/:id',
    asyncHandler(async (req: Request, res: Response) => {
      service.delete(String(req.params.id ?? ''));
      res.status(204).end();
    }),
  );

  return router;
}
