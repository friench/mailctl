import { Router, type Request, type Response } from 'express';
import type { SuppressionService } from '../../../domain/suppressions/service';
import { serializeSuppression } from '../../../domain/suppressions/serialize';
import { asyncHandler } from '../../../lib/async-handler';
import { createSuppressionSchema } from '../../validators/suppressions';

/**
 * Recipient suppression list. Global admin resource. Addresses here are blocked
 * on `POST /send` (unless the API key is suppression-exempt); hard bounces
 * auto-populate the list.
 */
export function adminSuppressionsRouter(service: SuppressionService) {
  const router = Router();

  router.get('/admin/api/suppressions', (_req: Request, res: Response) => {
    res.json(service.list().map(serializeSuppression));
  });

  router.post(
    '/admin/api/suppressions',
    asyncHandler(async (req: Request, res: Response) => {
      const data = createSuppressionSchema.parse(req.body);
      const row = service.add({
        address: data.address,
        reason: data.reason,
        note: data.note ?? null,
      });
      res.status(201).json(serializeSuppression(row));
    }),
  );

  router.delete(
    '/admin/api/suppressions/:id',
    asyncHandler(async (req: Request, res: Response) => {
      service.remove(String(req.params.id ?? ''));
      res.status(204).end();
    }),
  );

  return router;
}
