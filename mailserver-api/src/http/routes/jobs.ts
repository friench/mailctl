import { Router, type Request, type Response, type NextFunction } from 'express';
import type { ApiKeyService } from '../../domain/apikeys/service';
import type { UserRepository } from '../../domain/users/repository';
import type { SendJobService } from '../../domain/queue/service';
import { serializeSendJob } from '../../domain/queue/serialize';
import type { Logger } from '../../logger';

/** /jobs accepts either a session (admin) or an API key (owner OR admin scope). */
export function jobsRouter(
  queueService: SendJobService,
  apiKeyService: ApiKeyService,
  userRepo: UserRepository,
  logger: Logger,
) {
  const router = Router();

  function jobsAuth(req: Request, res: Response, next: NextFunction): void {
    if (req.session?.userId) {
      const user = userRepo.findById(req.session.userId);
      if (user) {
        req.authUser = user;
        next();
        return;
      }
      req.session.destroy();
    }

    const provided = req.headers['x-api-key'];
    if (typeof provided !== 'string' || provided.length === 0) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const result = apiKeyService.verify(provided);
    if (!result.ok) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    req.apiKey = result.apiKey;
    try {
      apiKeyService.touchLastUsed(result.apiKey.id);
    } catch (err) {
      logger.warn({ err, keyId: result.apiKey.id }, 'Failed to update last_used_at');
    }
    next();
  }

  router.use('/jobs', jobsAuth);

  router.get('/jobs', (req: Request, res: Response) => {
    const isAdmin = !!req.authUser || (req.apiKey?.scopes.includes('admin') ?? false);
    const jobs = isAdmin
      ? queueService.list({ limit: 100 })
      : queueService.list({ apiKeyId: req.apiKey?.id ?? null, limit: 100 });
    res.json(jobs.map(serializeSendJob));
  });

  router.get('/jobs/:id', (req: Request, res: Response) => {
    const job = queueService.findById(String(req.params.id ?? ''));
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    const isAdmin = !!req.authUser || (req.apiKey?.scopes.includes('admin') ?? false);
    const isOwner = !!req.apiKey && job.apiKeyId === req.apiKey.id;
    if (!isAdmin && !isOwner) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    res.json(serializeSendJob(job));
  });

  return router;
}
