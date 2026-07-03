import { Router, type Request, type Response } from 'express';
import type { DnsCheckDTO } from '../../../contracts';
import type { DomainService } from '../../../domain/domains/service';
import type { DomainDnsService } from '../../../domain/domains/dns-service';
import { serializeDomain } from '../../../domain/domains/serialize';
import { asyncHandler } from '../../../lib/async-handler';
import {
  createDomainSchema,
  regenerateDkimSchema,
  updateDomainSchema,
} from '../../validators/domains';
import { FULL_ACCESS, assertInScope, scopeById } from '../../../lib/authz';

export function adminDomainsRouter(domainService: DomainService, dnsService: DomainDnsService) {
  const router = Router();

  /** Creating/removing a domain is a superadmin action even for domain admins. */
  const requireGlobal = (req: Request, res: Response): boolean => {
    if ((req.authz ?? FULL_ACCESS).scope !== 'all') {
      res.status(403).json({ error: 'Forbidden: managing domains requires an admin role' });
      return false;
    }
    return true;
  };

  router.get('/admin/api/domains', (req: Request, res: Response) => {
    res.json(scopeById(req.authz ?? FULL_ACCESS, domainService.list()).map(serializeDomain));
  });

  router.post(
    '/admin/api/domains',
    asyncHandler(async (req: Request, res: Response) => {
      if (!requireGlobal(req, res)) return;
      const data = createDomainSchema.parse(req.body);
      const row = await domainService.create(data);
      res.status(201).json(serializeDomain(row));
    }),
  );

  router.get('/admin/api/domains/:id', (req: Request, res: Response) => {
    const row = domainService.findById(String(req.params.id ?? ''));
    if (!row || scopeById(req.authz ?? FULL_ACCESS, [row]).length === 0) {
      res.status(404).json({ error: 'Domain not found' });
      return;
    }
    res.json(serializeDomain(row));
  });

  router.patch(
    '/admin/api/domains/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const id = String(req.params.id ?? '');
      assertInScope(req.authz ?? FULL_ACCESS, id);
      const data = updateDomainSchema.parse(req.body);
      const row = await domainService.update(id, data);
      res.json(serializeDomain(row));
    }),
  );

  router.delete(
    '/admin/api/domains/:id',
    asyncHandler(async (req: Request, res: Response) => {
      if (!requireGlobal(req, res)) return;
      await domainService.delete(String(req.params.id ?? ''));
      res.status(204).end();
    }),
  );

  router.post(
    '/admin/api/domains/:id/dkim',
    asyncHandler(async (req: Request, res: Response) => {
      const id = String(req.params.id ?? '');
      assertInScope(req.authz ?? FULL_ACCESS, id);
      const data = regenerateDkimSchema.parse(req.body ?? {});
      const row = await domainService.regenerateDkim(id, data.selector, data.keysize);
      res.json(serializeDomain(row));
    }),
  );

  router.get(
    '/admin/api/domains/:id/dns-check',
    asyncHandler(async (req: Request, res: Response) => {
      const id = String(req.params.id ?? '');
      const row = domainService.findById(id);
      if (!row || scopeById(req.authz ?? FULL_ACCESS, [row]).length === 0) {
        res.status(404).json({ error: 'Domain not found' });
        return;
      }
      const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
      const result = await dnsService.check(row, { refresh });
      res.json(result satisfies DnsCheckDTO);
    }),
  );

  return router;
}
