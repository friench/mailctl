import { Router, type Request, type Response } from 'express';
import type { AppSettingsDTO } from '../../../contracts';

/** UI-facing, non-secret settings (e.g. the webmail link). Admin-scoped. */
export function adminSettingsRouter(webmailUrl: string | null) {
  const router = Router();

  router.get('/admin/api/settings', (_req: Request, res: Response) => {
    res.json({ webmailUrl } satisfies AppSettingsDTO);
  });

  return router;
}
