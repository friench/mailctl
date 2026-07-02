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

export function adminDomainsRouter(domainService: DomainService, dnsService: DomainDnsService) {
  const router = Router();

  router.get('/admin/api/domains', (_req: Request, res: Response) => {
    res.json(domainService.list().map(serializeDomain));
  });

  router.post(
    '/admin/api/domains',
    asyncHandler(async (req: Request, res: Response) => {
      const data = createDomainSchema.parse(req.body);
      const row = await domainService.create(data);
      res.status(201).json(serializeDomain(row));
    }),
  );

  router.get('/admin/api/domains/:id', (req: Request, res: Response) => {
    const row = domainService.findById(String(req.params.id ?? ''));
    if (!row) {
      res.status(404).json({ error: 'Domain not found' });
      return;
    }
    res.json(serializeDomain(row));
  });

  router.patch(
    '/admin/api/domains/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const data = updateDomainSchema.parse(req.body);
      const row = await domainService.update(String(req.params.id ?? ''), data);
      res.json(serializeDomain(row));
    }),
  );

  router.delete(
    '/admin/api/domains/:id',
    asyncHandler(async (req: Request, res: Response) => {
      await domainService.delete(String(req.params.id ?? ''));
      res.status(204).end();
    }),
  );

  router.post(
    '/admin/api/domains/:id/dkim',
    asyncHandler(async (req: Request, res: Response) => {
      const data = regenerateDkimSchema.parse(req.body ?? {});
      const row = await domainService.regenerateDkim(
        String(req.params.id ?? ''),
        data.selector,
        data.keysize,
      );
      res.json(serializeDomain(row));
    }),
  );

  router.get(
    '/admin/api/domains/:id/dns-check',
    asyncHandler(async (req: Request, res: Response) => {
      const id = String(req.params.id ?? '');
      const row = domainService.findById(id);
      if (!row) {
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
