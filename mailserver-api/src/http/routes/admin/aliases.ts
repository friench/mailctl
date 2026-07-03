import { Router, type Request, type Response } from 'express';
import type { AliasService } from '../../../domain/aliases/service';
import type { DomainService } from '../../../domain/domains/service';
import { serializeAlias } from '../../../domain/aliases/serialize';
import { asyncHandler } from '../../../lib/async-handler';
import { domainOf } from '../../../lib/address';
import { FULL_ACCESS, assertInScope, inScope, scopeByDomainId } from '../../../lib/authz';
import type { AliasRow } from '../../../db/schema';
import {
  createAliasSchema,
  generateTempAliasSchema,
  updateAliasSchema,
} from '../../validators/aliases';

export function adminAliasesRouter(service: AliasService, domainService: DomainService) {
  const router = Router();

  const scopedFindById = (req: Request, id: string): AliasRow | null => {
    const row = service.findById(id);
    if (!row || !inScope(req.authz ?? FULL_ACCESS, row.domainId)) return null;
    return row;
  };
  const domainIdOfName = (name: string): string | null =>
    domainService.list().find((d) => d.name === name)?.id ?? null;

  router.get('/admin/api/aliases', (req: Request, res: Response) => {
    res.json(scopeByDomainId(req.authz ?? FULL_ACCESS, service.list()).map(serializeAlias));
  });

  router.post(
    '/admin/api/aliases',
    asyncHandler(async (req: Request, res: Response) => {
      const data = createAliasSchema.parse(req.body);
      assertInScope(req.authz ?? FULL_ACCESS, domainIdOfName(domainOf(data.address)));
      const created = await service.create(data);
      res.status(201).json(serializeAlias(created));
    }),
  );

  router.post(
    '/admin/api/aliases/temp',
    asyncHandler(async (req: Request, res: Response) => {
      const data = generateTempAliasSchema.parse(req.body);
      assertInScope(req.authz ?? FULL_ACCESS, domainIdOfName(data.domain.toLowerCase()));
      const created = await service.generateTemp(data);
      res.status(201).json(serializeAlias(created));
    }),
  );

  router.patch(
    '/admin/api/aliases/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const id = String(req.params.id ?? '');
      if (!scopedFindById(req, id)) {
        res.status(404).json({ error: 'Alias not found' });
        return;
      }
      const data = updateAliasSchema.parse(req.body);
      const updated = await service.update(id, data);
      res.json(serializeAlias(updated));
    }),
  );

  router.delete(
    '/admin/api/aliases/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const id = String(req.params.id ?? '');
      if (!scopedFindById(req, id)) {
        res.status(404).json({ error: 'Alias not found' });
        return;
      }
      await service.delete(id);
      res.status(204).end();
    }),
  );

  return router;
}
