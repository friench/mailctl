import { Router, type Request, type Response } from 'express';
import type { MailboxService } from '../../../domain/mailboxes/service';
import type { UserService } from '../../../domain/users/service';
import type { SieveService } from '../../../domain/sieve/service';
import type { QuarantineService } from '../../../domain/quarantine/service';
import { serializeMailbox } from '../../../domain/mailboxes/serialize';
import { serializeQuarantineBox } from '../../../domain/quarantine/serialize';
import { asyncHandler } from '../../../lib/async-handler';
import { changePasswordSchema } from '../../validators/users';
import { sieveConfigSchema } from '../../validators/sieve';
import type { SelfServiceDTO } from '../../../contracts';

/**
 * End-user self-service — a logged-in user manages their own mailbox (matched by
 * their account email). Available to any authenticated role (the RBAC guard
 * allow-lists `/me`); each action only ever touches the caller's own mailbox.
 */
export function adminMeRouter(
  mailboxService: MailboxService,
  userService: UserService,
  sieveService: SieveService,
  quarantineService: QuarantineService,
) {
  const router = Router();

  const ownMailboxId = (req: Request): string | null => {
    const email = req.authUser?.email;
    const mailbox = email ? mailboxService.findByAddress(email) : undefined;
    return mailbox?.id ?? null;
  };

  const parseUid = (raw: string): number | null => {
    const uid = Number.parseInt(raw, 10);
    return Number.isInteger(uid) && uid >= 0 ? uid : null;
  };

  router.get('/admin/api/me', (req: Request, res: Response) => {
    const email = req.authUser?.email;
    const mailbox = email ? mailboxService.findByAddress(email) : undefined;
    res.json({ mailbox: mailbox ? serializeMailbox(mailbox) : null } satisfies SelfServiceDTO);
  });

  router.patch(
    '/admin/api/me/password',
    asyncHandler(async (req: Request, res: Response) => {
      const user = req.authUser;
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const { password } = changePasswordSchema.parse(req.body);
      // Change the mailbox (email) password first — it enforces the strength policy.
      const mailbox = mailboxService.findByAddress(user.email);
      if (mailbox) await mailboxService.updatePassword(mailbox.id, password);
      await userService.changePassword(user.id, password);
      res.status(204).end();
    }),
  );

  router.get('/admin/api/me/sieve', (req: Request, res: Response) => {
    const id = ownMailboxId(req);
    if (!id) {
      res.status(404).json({ error: 'No mailbox linked to this account' });
      return;
    }
    res.json(sieveService.get(id));
  });

  router.put(
    '/admin/api/me/sieve',
    asyncHandler(async (req: Request, res: Response) => {
      const id = ownMailboxId(req);
      if (!id) {
        res.status(404).json({ error: 'No mailbox linked to this account' });
        return;
      }
      const config = sieveConfigSchema.parse(req.body);
      res.json(await sieveService.set(id, config));
    }),
  );

  router.get(
    '/admin/api/me/quarantine',
    asyncHandler(async (req: Request, res: Response) => {
      const id = ownMailboxId(req);
      if (!id) {
        res.status(404).json({ error: 'No mailbox linked to this account' });
        return;
      }
      res.json(serializeQuarantineBox(await quarantineService.listForMailbox(id)));
    }),
  );

  router.get(
    '/admin/api/me/quarantine/:uid',
    asyncHandler(async (req: Request, res: Response) => {
      const id = ownMailboxId(req);
      const uid = parseUid(String(req.params.uid ?? ''));
      if (!id || uid === null) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.type('text/plain').send(await quarantineService.getMessage(id, uid));
    }),
  );

  router.post(
    '/admin/api/me/quarantine/:uid/release',
    asyncHandler(async (req: Request, res: Response) => {
      const id = ownMailboxId(req);
      const uid = parseUid(String(req.params.uid ?? ''));
      if (!id || uid === null) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      await quarantineService.release(id, uid);
      res.status(204).end();
    }),
  );

  router.delete(
    '/admin/api/me/quarantine/:uid',
    asyncHandler(async (req: Request, res: Response) => {
      const id = ownMailboxId(req);
      const uid = parseUid(String(req.params.uid ?? ''));
      if (!id || uid === null) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      await quarantineService.remove(id, uid);
      res.status(204).end();
    }),
  );

  return router;
}
