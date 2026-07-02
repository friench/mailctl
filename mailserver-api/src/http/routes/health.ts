import { Router } from 'express';
import type { HealthDTO } from '../../contracts';
import type { MailSender } from '../../domain/send/mailer';

export function healthRouter(mailer: MailSender) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      accounts: mailer.accountCount,
    } satisfies HealthDTO);
  });

  return router;
}
