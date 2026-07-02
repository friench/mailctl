import { Router, type Request, type Response } from 'express';
import type { SyncService } from '../../../domain/sync/service';
import { asyncHandler } from '../../../lib/async-handler';
import { applySyncSchema } from '../../validators/sync';

export function adminSyncRouter(service: SyncService) {
  const router = Router();

  router.get(
    '/admin/api/sync/preview',
    asyncHandler(async (_req: Request, res: Response) => {
      res.json(await service.preview());
    }),
  );

  router.get('/admin/api/sync/status', (_req: Request, res: Response) => {
    res.json(service.status());
  });

  router.post(
    '/admin/api/sync/apply',
    asyncHandler(async (req: Request, res: Response) => {
      const data = applySyncSchema.parse(req.body);
      const outcome = await service.apply(data.resolutions, {
        confirmDeletes: data.confirmDeletes,
      });
      res.json(outcome);
    }),
  );

  return router;
}
