import { Router, type Request, type Response } from 'express';
import type { WebhookService } from '../../../domain/webhooks/service';
import { serializeWebhook, serializeDelivery } from '../../../domain/webhooks/serialize';
import { asyncHandler } from '../../../lib/async-handler';
import { createWebhookSchema, updateWebhookSchema } from '../../validators/webhooks';

export function adminWebhooksRouter(service: WebhookService) {
  const router = Router();

  router.get('/admin/api/webhooks', (_req: Request, res: Response) => {
    res.json(service.list().map(serializeWebhook));
  });

  router.post(
    '/admin/api/webhooks',
    asyncHandler(async (req: Request, res: Response) => {
      const data = createWebhookSchema.parse(req.body);
      const created = service.create(data);
      // The plain secret is returned ONLY here.
      res.status(201).json({
        id: created.id,
        name: created.name,
        url: created.url,
        events: created.events,
        active: created.active,
        createdAt: created.createdAt.toISOString(),
        secret: created.secret,
      });
    }),
  );

  router.get('/admin/api/webhooks/:id', (req: Request, res: Response) => {
    const row = service.findById(String(req.params.id ?? ''));
    if (!row) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }
    res.json(serializeWebhook(row));
  });

  router.patch(
    '/admin/api/webhooks/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const data = updateWebhookSchema.parse(req.body);
      const row = service.update(String(req.params.id ?? ''), data);
      res.json(serializeWebhook(row));
    }),
  );

  router.delete('/admin/api/webhooks/:id', (req: Request, res: Response) => {
    service.delete(String(req.params.id ?? ''));
    res.status(204).end();
  });

  router.get('/admin/api/webhooks/:id/deliveries', (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    if (!service.findById(id)) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }
    res.json(service.listDeliveries(id).map(serializeDelivery));
  });

  router.post(
    '/admin/api/webhooks/:id/test',
    asyncHandler(async (req: Request, res: Response) => {
      const id = String(req.params.id ?? '');
      const delivery = service.enqueueTest(id);
      const result = await service.processSpecific(delivery.id);
      res.status(202).json(serializeDelivery(result));
    }),
  );

  return router;
}
