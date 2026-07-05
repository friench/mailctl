import { Router, type Request, type Response } from 'express';
import type { OpsService } from '../../../domain/ops/service';
import { asyncHandler } from '../../../lib/async-handler';
import type { LogLinesDTO, MailQueueDTO, SessionDTO } from '../../../contracts';

/**
 * Operational read-only views — mail log tail/search, the Postfix queue, and
 * active IMAP/POP3 sessions. Global admin resource (surfaces server-wide state).
 */
export function adminOpsRouter(service: OpsService) {
  const router = Router();

  router.get(
    '/admin/api/ops/logs',
    asyncHandler(async (req: Request, res: Response) => {
      const lines = req.query.lines ? Number.parseInt(String(req.query.lines), 10) : undefined;
      const query = req.query.q ? String(req.query.q) : null;
      const result = await service.logs({
        lines: Number.isFinite(lines) ? lines : undefined,
        query,
      });
      res.json(result satisfies LogLinesDTO);
    }),
  );

  router.get(
    '/admin/api/ops/queue',
    asyncHandler(async (_req: Request, res: Response) => {
      res.json((await service.mailQueue()) satisfies MailQueueDTO);
    }),
  );

  router.get(
    '/admin/api/ops/sessions',
    asyncHandler(async (_req: Request, res: Response) => {
      res.json((await service.sessions()) satisfies SessionDTO[]);
    }),
  );

  return router;
}
