import { Router, type Request, type Response } from 'express';
import type { AliasService } from '../../../domain/aliases/service';
import { serializeAlias } from '../../../domain/aliases/serialize';
import { asyncHandler } from '../../../lib/async-handler';
import { createAliasSchema } from '../../validators/aliases';

export function adminAliasesRouter(service: AliasService) {
  const router = Router();

  router.get('/admin/api/aliases', (_req: Request, res: Response) => {
    res.json(service.list().map(serializeAlias));
  });

  router.post(
    '/admin/api/aliases',
    asyncHandler(async (req: Request, res: Response) => {
      const data = createAliasSchema.parse(req.body);
      const created = await service.create(data);
      res.status(201).json(serializeAlias(created));
    }),
  );

  router.delete(
    '/admin/api/aliases/:id',
    asyncHandler(async (req: Request, res: Response) => {
      await service.delete(String(req.params.id ?? ''));
      res.status(204).end();
    }),
  );

  return router;
}
