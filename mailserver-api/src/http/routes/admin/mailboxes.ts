import { Router, type Request, type Response } from 'express';
import type { MailboxService } from '../../../domain/mailboxes/service';
import type { DomainService } from '../../../domain/domains/service';
import type { SieveService } from '../../../domain/sieve/service';
import { serializeMailbox } from '../../../domain/mailboxes/serialize';
import { asyncHandler } from '../../../lib/async-handler';
import { domainOf } from '../../../lib/address';
import { FULL_ACCESS, assertInScope, inScope, scopeByDomainId } from '../../../lib/authz';
import type { MailboxRow } from '../../../db/schema';
import {
  createMailboxSchema,
  updateMailboxSchema,
  updatePasswordSchema,
} from '../../validators/mailboxes';
import { sieveConfigSchema } from '../../validators/sieve';

export function adminMailboxesRouter(
  service: MailboxService,
  domainService: DomainService,
  sieveService: SieveService,
) {
  const router = Router();

  /** Load a mailbox only when it is within the actor's domain scope (else null). */
  const scopedFindById = (req: Request, id: string): MailboxRow | null => {
    const row = service.findById(id);
    if (!row || !inScope(req.authz ?? FULL_ACCESS, row.domainId)) return null;
    return row;
  };

  router.get('/admin/api/mailboxes', (req: Request, res: Response) => {
    res.json(scopeByDomainId(req.authz ?? FULL_ACCESS, service.list()).map(serializeMailbox));
  });

  router.post(
    '/admin/api/mailboxes',
    asyncHandler(async (req: Request, res: Response) => {
      const data = createMailboxSchema.parse(req.body);
      const domain = domainService.list().find((d) => d.name === domainOf(data.address));
      assertInScope(req.authz ?? FULL_ACCESS, domain?.id ?? null);
      const row = await service.create(data);
      res.status(201).json(serializeMailbox(row));
    }),
  );

  router.get('/admin/api/mailboxes/:id', (req: Request, res: Response) => {
    const row = scopedFindById(req, String(req.params.id ?? ''));
    if (!row) {
      res.status(404).json({ error: 'Mailbox not found' });
      return;
    }
    res.json(serializeMailbox(row));
  });

  router.patch(
    '/admin/api/mailboxes/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const id = String(req.params.id ?? '');
      if (!scopedFindById(req, id)) {
        res.status(404).json({ error: 'Mailbox not found' });
        return;
      }
      const data = updateMailboxSchema.parse(req.body);
      const row = await service.update(id, data);
      res.json(serializeMailbox(row));
    }),
  );

  router.patch(
    '/admin/api/mailboxes/:id/password',
    asyncHandler(async (req: Request, res: Response) => {
      const id = String(req.params.id ?? '');
      if (!scopedFindById(req, id)) {
        res.status(404).json({ error: 'Mailbox not found' });
        return;
      }
      const data = updatePasswordSchema.parse(req.body);
      await service.updatePassword(id, data.password);
      res.status(204).end();
    }),
  );

  router.delete(
    '/admin/api/mailboxes/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const id = String(req.params.id ?? '');
      if (!scopedFindById(req, id)) {
        res.status(404).json({ error: 'Mailbox not found' });
        return;
      }
      await service.delete(id);
      res.status(204).end();
    }),
  );

  router.get('/admin/api/mailboxes/:id/sieve', (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    if (!scopedFindById(req, id)) {
      res.status(404).json({ error: 'Mailbox not found' });
      return;
    }
    res.json(sieveService.get(id));
  });

  router.put(
    '/admin/api/mailboxes/:id/sieve',
    asyncHandler(async (req: Request, res: Response) => {
      const id = String(req.params.id ?? '');
      if (!scopedFindById(req, id)) {
        res.status(404).json({ error: 'Mailbox not found' });
        return;
      }
      const config = sieveConfigSchema.parse(req.body);
      res.json(await sieveService.set(id, config));
    }),
  );

  return router;
}
