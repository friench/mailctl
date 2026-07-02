import { Router, type Request, type Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { register } from '../../lib/metrics';

/** Constant-time string comparison that never short-circuits on length. */
function tokensMatch(provided: string | undefined, expected: string): boolean {
  if (provided === undefined) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function metricsRouter(opts: { token?: string } = {}) {
  const router = Router();
  const { token } = opts;

  router.get('/metrics', async (req: Request, res: Response) => {
    if (token) {
      const auth = req.headers.authorization;
      const bearer = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length) : undefined;
      const provided =
        bearer ?? (typeof req.query.token === 'string' ? req.query.token : undefined);
      if (!tokensMatch(provided, token)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    }
    res.setHeader('Content-Type', register.contentType);
    res.send(await register.metrics());
  });

  return router;
}
