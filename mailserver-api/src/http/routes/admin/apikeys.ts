import { Router, type Request, type Response } from 'express';
import type { ApiKeyService } from '../../../domain/apikeys/service';
import { serializeApiKey } from '../../../domain/apikeys/serialize';
import { asyncHandler } from '../../../lib/async-handler';
import { createApiKeySchema } from '../../validators/apikeys';

export function adminApiKeysRouter(service: ApiKeyService) {
  const router = Router();

  router.get('/admin/api/api-keys', (_req: Request, res: Response) => {
    res.json(service.list().map(serializeApiKey));
  });

  router.post(
    '/admin/api/api-keys',
    asyncHandler(async (req: Request, res: Response) => {
      const { name, scopes, expiresAt } = createApiKeySchema.parse(req.body);
      const created = service.generateAndStore(name, {
        scopes,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      });
      // The plaintext key is returned ONLY here, never again.
      res.status(201).json({
        id: created.id,
        name: created.name,
        prefix: created.prefix,
        scopes: created.scopes,
        expiresAt: created.expiresAt?.toISOString() ?? null,
        plain: created.plain,
      });
    }),
  );

  // Revoke (soft-disable) rather than hard-delete: keeps the audit trail and
  // immediately invalidates the key (verify → 'revoked').
  router.delete('/admin/api/api-keys/:id', (req: Request, res: Response) => {
    service.revoke(String(req.params.id ?? ''));
    res.status(204).end();
  });

  return router;
}
