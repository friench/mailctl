import { Router, type Request, type Response } from 'express';
import { buildOpenApiDocument } from '../../lib/openapi';
import { appVersion } from '../../version';

/** Serves the OpenAPI 3.1 document (unauthenticated) at `GET /openapi.json`. */
export function openapiRouter() {
  const router = Router();
  // Built once at startup; the manifest is static.
  const document = buildOpenApiDocument(appVersion());

  router.get('/openapi.json', (_req: Request, res: Response) => {
    res.json(document);
  });

  return router;
}
