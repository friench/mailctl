import { Router, type Request, type Response } from 'express';
import type { UserService } from '../../../domain/users/service';
import { serializeUser } from '../../../domain/users/serialize';
import { asyncHandler } from '../../../lib/async-handler';
import { createUserSchema, changePasswordSchema } from '../../validators/users';

export function adminUsersRouter(service: UserService) {
  const router = Router();

  router.get('/admin/api/users', (_req: Request, res: Response) => {
    res.json(service.list().map(serializeUser));
  });

  router.post(
    '/admin/api/users',
    asyncHandler(async (req: Request, res: Response) => {
      const data = createUserSchema.parse(req.body);
      const user = await service.create(data.email, data.password);
      res.status(201).json(serializeUser(user));
    }),
  );

  router.patch(
    '/admin/api/users/:id/password',
    asyncHandler(async (req: Request, res: Response) => {
      const data = changePasswordSchema.parse(req.body);
      await service.changePassword(String(req.params.id ?? ''), data.password);
      res.status(204).end();
    }),
  );

  router.delete('/admin/api/users/:id', (req: Request, res: Response) => {
    service.delete(String(req.params.id ?? ''));
    res.status(204).end();
  });

  return router;
}
