import { Router, type Request, type Response } from 'express';
import type { EngineService } from '../../../domain/engine/service';
import { serializeEngineOverview } from '../../../domain/engine/serialize';
import { asyncHandler } from '../../../lib/async-handler';

/**
 * Engine observability — Rspamd/Dovecot stats, docker-mailserver feature
 * toggles, and companion container status/restart. Global admin resource
 * (surfaces server-wide engine state and can restart containers).
 */
export function adminEngineRouter(service: EngineService) {
  const router = Router();

  router.get(
    '/admin/api/engine/overview',
    asyncHandler(async (_req: Request, res: Response) => {
      res.json(serializeEngineOverview(await service.overview()));
    }),
  );

  router.post(
    '/admin/api/engine/containers/:name/restart',
    asyncHandler(async (req: Request, res: Response) => {
      await service.restartContainer(String(req.params.name ?? ''));
      res.status(202).json({ restarted: String(req.params.name ?? '') });
    }),
  );

  return router;
}
