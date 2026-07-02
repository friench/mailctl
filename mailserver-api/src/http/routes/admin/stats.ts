import { Router, type Request, type Response } from 'express';
import type { StatsSnapshotDTO } from '../../../contracts';
import type { StatsService } from '../../../domain/stats/service';

export function adminStatsRouter(statsService: StatsService) {
  const router = Router();

  router.get('/admin/api/stats', (_req: Request, res: Response) => {
    res.json(statsService.snapshot() satisfies StatsSnapshotDTO);
  });

  return router;
}
