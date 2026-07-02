import { Router, type Request, type Response } from 'express';
import type { FeatureFlagService } from '../../../domain/feature-flags/service';
import { serializeFlag } from '../../../domain/feature-flags/serialize';
import { asyncHandler } from '../../../lib/async-handler';
import { setFlagSchema } from '../../validators/feature-flags';

export function adminFeatureFlagsRouter(service: FeatureFlagService) {
  const router = Router();

  router.get('/admin/api/feature-flags', (_req: Request, res: Response) => {
    res.json(service.list().map(serializeFlag));
  });

  router.patch(
    '/admin/api/feature-flags/:key',
    asyncHandler(async (req: Request, res: Response) => {
      const data = setFlagSchema.parse(req.body);
      const view = service.setEnabled(String(req.params.key ?? ''), data.enabled);
      res.json(serializeFlag(view));
    }),
  );

  router.delete('/admin/api/feature-flags/:key', (req: Request, res: Response) => {
    const view = service.reset(String(req.params.key ?? ''));
    res.json(serializeFlag(view));
  });

  return router;
}
