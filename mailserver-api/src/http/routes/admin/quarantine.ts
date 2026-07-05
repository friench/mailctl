import { Router, type Request, type Response } from 'express';
import type { MailboxService } from '../../../domain/mailboxes/service';
import type { QuarantineService } from '../../../domain/quarantine/service';
import { serializeQuarantineBox } from '../../../domain/quarantine/serialize';
import { asyncHandler } from '../../../lib/async-handler';
import { FULL_ACCESS, inScope, scopeByDomainId } from '../../../lib/authz';
import type { MailboxRow } from '../../../db/schema';
import { quarantineBulkSchema } from '../../validators/quarantine';

/**
 * Spam quarantine — inspect/release/delete messages in mailboxes' Junk folders.
 * Domain-scoped: a domain admin only sees quarantine for mailboxes in their
 * domains (a mailbox outside scope reads as 404). Writes require `canWrite`
 * (enforced by the RBAC guard).
 */
export function adminQuarantineRouter(
  mailboxService: MailboxService,
  quarantineService: QuarantineService,
) {
  const router = Router();

  const scopedMailbox = (req: Request, id: string): MailboxRow | null => {
    const row = mailboxService.findById(id);
    if (!row || !inScope(req.authz ?? FULL_ACCESS, row.domainId)) return null;
    return row;
  };

  const parseUid = (raw: string): number | null => {
    const uid = Number.parseInt(raw, 10);
    return Number.isInteger(uid) && uid >= 0 ? uid : null;
  };

  // List quarantine — optionally for a single `?mailboxId=`, else across all
  // mailboxes in the actor's scope. Empty boxes are omitted from the aggregate.
  router.get(
    '/admin/api/quarantine',
    asyncHandler(async (req: Request, res: Response) => {
      const authz = req.authz ?? FULL_ACCESS;
      const mailboxId = req.query.mailboxId ? String(req.query.mailboxId) : null;

      if (mailboxId) {
        if (!scopedMailbox(req, mailboxId)) {
          res.status(404).json({ error: 'Mailbox not found' });
          return;
        }
        const box = await quarantineService.listForMailbox(mailboxId);
        res.json([serializeQuarantineBox(box)]);
        return;
      }

      const scoped = scopeByDomainId(authz, mailboxService.list());
      const boxes = await quarantineService.listForMailboxes(scoped);
      res.json(boxes.filter((b) => b.messages.length > 0).map(serializeQuarantineBox));
    }),
  );

  router.get(
    '/admin/api/quarantine/:mailboxId/:uid',
    asyncHandler(async (req: Request, res: Response) => {
      const mailboxId = String(req.params.mailboxId ?? '');
      const uid = parseUid(String(req.params.uid ?? ''));
      if (!scopedMailbox(req, mailboxId) || uid === null) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      const raw = await quarantineService.getMessage(mailboxId, uid);
      res.type('text/plain').send(raw);
    }),
  );

  router.post(
    '/admin/api/quarantine/:mailboxId/:uid/release',
    asyncHandler(async (req: Request, res: Response) => {
      const mailboxId = String(req.params.mailboxId ?? '');
      const uid = parseUid(String(req.params.uid ?? ''));
      if (!scopedMailbox(req, mailboxId) || uid === null) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      await quarantineService.release(mailboxId, uid);
      res.status(204).end();
    }),
  );

  router.delete(
    '/admin/api/quarantine/:mailboxId/:uid',
    asyncHandler(async (req: Request, res: Response) => {
      const mailboxId = String(req.params.mailboxId ?? '');
      const uid = parseUid(String(req.params.uid ?? ''));
      if (!scopedMailbox(req, mailboxId) || uid === null) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      await quarantineService.remove(mailboxId, uid);
      res.status(204).end();
    }),
  );

  router.post(
    '/admin/api/quarantine/:mailboxId/actions',
    asyncHandler(async (req: Request, res: Response) => {
      const mailboxId = String(req.params.mailboxId ?? '');
      if (!scopedMailbox(req, mailboxId)) {
        res.status(404).json({ error: 'Mailbox not found' });
        return;
      }
      const { uids, action } = quarantineBulkSchema.parse(req.body);
      const handled = await quarantineService.bulk(mailboxId, uids, action);
      res.json({ handled });
    }),
  );

  return router;
}
