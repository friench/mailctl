import { Router, type Request, type Response } from 'express';
import type { AccessListService } from '../../../domain/access-lists/service';
import { serializeAccessRule } from '../../../domain/access-lists/serialize';
import { asyncHandler } from '../../../lib/async-handler';
import { createAccessRuleSchema } from '../../validators/access-lists';

/**
 * Allow/deny lists — sender/domain/IP allow- and block-list rules, optionally
 * scoped per recipient. Global admin resource (not domain-scoped): rules can
 * cover any sender/IP and affect the whole server, so they require full access.
 */
export function adminAccessListsRouter(service: AccessListService) {
  const router = Router();

  router.get('/admin/api/access-rules', (_req: Request, res: Response) => {
    res.json(service.list().map(serializeAccessRule));
  });

  router.post(
    '/admin/api/access-rules',
    asyncHandler(async (req: Request, res: Response) => {
      const data = createAccessRuleSchema.parse(req.body);
      const row = await service.create({
        matchType: data.matchType,
        action: data.action,
        value: data.value,
        recipient: data.recipient ?? null,
        note: data.note ?? null,
      });
      res.status(201).json(serializeAccessRule(row));
    }),
  );

  router.delete(
    '/admin/api/access-rules/:id',
    asyncHandler(async (req: Request, res: Response) => {
      await service.delete(String(req.params.id ?? ''));
      res.status(204).end();
    }),
  );

  /** Force a rewrite of the DMS enforcement config from the current rules. */
  router.post(
    '/admin/api/access-rules/regenerate',
    asyncHandler(async (_req: Request, res: Response) => {
      await service.regenerate();
      res.status(204).end();
    }),
  );

  return router;
}
