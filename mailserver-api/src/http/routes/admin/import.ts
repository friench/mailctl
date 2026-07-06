import { Router, type Request, type Response } from 'express';
import type { ImportService } from '../../../domain/import/service';
import { asyncHandler } from '../../../lib/async-handler';
import { importDocumentSchema } from '../../validators/import';
import type { ImportResultDTO } from '../../../contracts';

/**
 * Idempotent bulk provisioning from a JSON document (domains/mailboxes/aliases).
 * Global admin resource — creating domains is a superadmin action. `?dryRun=true`
 * reports the plan without applying anything.
 */
export function adminImportRouter(service: ImportService) {
  const router = Router();

  router.post(
    '/admin/api/import',
    asyncHandler(async (req: Request, res: Response) => {
      const doc = importDocumentSchema.parse(req.body);
      const dryRun = req.query.dryRun === 'true' || req.query.dryRun === '1';
      const result = await service.run(doc, { dryRun });
      res.json(result satisfies ImportResultDTO);
    }),
  );

  return router;
}
