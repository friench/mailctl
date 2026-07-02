import { Router, type Request, type Response } from 'express';
import type { BackupsResponseDTO } from '../../../contracts';
import type { BackupService } from '../../../domain/backups/service';
import type { FeatureFlagService } from '../../../domain/feature-flags/service';
import { asyncHandler } from '../../../lib/async-handler';

export interface BackupRouterConfig {
  intervalHours: number;
  keep: number;
  dir: string;
  featureFlags: FeatureFlagService;
}

export function adminBackupsRouter(service: BackupService, config: BackupRouterConfig) {
  const router = Router();

  router.get(
    '/admin/api/backups',
    asyncHandler(async (_req: Request, res: Response) => {
      const items = await service.listBackups();
      res.json({
        s3Configured: service.s3Configured,
        config: {
          enabled: config.featureFlags.isEnabled('backups_enabled'),
          intervalHours: config.intervalHours,
          keep: config.keep,
          dir: config.dir,
        },
        items,
      } satisfies BackupsResponseDTO);
    }),
  );

  router.post(
    '/admin/api/backups',
    asyncHandler(async (_req: Request, res: Response) => {
      const result = await service.runBackup();
      res.status(201).json({ ok: true, ...result });
    }),
  );

  return router;
}
