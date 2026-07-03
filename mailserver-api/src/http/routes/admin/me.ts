import { Router, type Request, type Response } from 'express';
import type { MailboxService } from '../../../domain/mailboxes/service';
import type { UserService } from '../../../domain/users/service';
import { serializeMailbox } from '../../../domain/mailboxes/serialize';
import { asyncHandler } from '../../../lib/async-handler';
import { changePasswordSchema } from '../../validators/users';
import type { SelfServiceDTO } from '../../../contracts';

/**
 * End-user self-service — a logged-in user manages their own mailbox (matched by
 * their account email). Available to any authenticated role (the RBAC guard
 * allow-lists `/me`); each action only ever touches the caller's own mailbox.
 */
export function adminMeRouter(mailboxService: MailboxService, userService: UserService) {
  const router = Router();

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

  return router;
}
