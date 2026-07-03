import { Router, type Request, type Response } from 'express';
import type { AppSettingsDTO } from '../../../contracts';

export interface AppSettings {
  webmailUrl: string | null;
  autoconfigEnabled: boolean;
}

/** UI-facing, non-secret settings (webmail link, autoconfig availability). Admin-scoped. */
export function adminSettingsRouter(settings: AppSettings) {
  const router = Router();

  router.get('/admin/api/settings', (_req: Request, res: Response) => {
    res.json(settings satisfies AppSettingsDTO);
  });

  return router;
}
