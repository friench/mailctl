import { Router, type Request, type Response } from 'express';
import type { UserService } from '../../../domain/users/service';
import { serializeUser } from '../../../domain/users/serialize';
import { asyncHandler } from '../../../lib/async-handler';
import { createUserSchema, updateUserSchema, changePasswordSchema } from '../../validators/users';

export function adminUsersRouter(service: UserService) {
  const router = Router();

  const toDto = (user: Parameters<typeof serializeUser>[0]) =>
    serializeUser(user, service.listDomainIds(user.id));

  router.get('/admin/api/users', (_req: Request, res: Response) => {
    res.json(service.list().map(toDto));
  });

  router.post(
    '/admin/api/users',
    asyncHandler(async (req: Request, res: Response) => {
      const data = createUserSchema.parse(req.body);
      const user = await service.create(data.email, data.password, data.role);
      res.status(201).json(toDto(user));
    }),
  );

  router.patch(
    '/admin/api/users/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const id = String(req.params.id ?? '');
      const data = updateUserSchema.parse(req.body);
      if (data.role === undefined && data.domainIds === undefined) {
        res.status(400).json({ error: 'No updatable fields provided' });
        return;
      }
      let user = service.findById(id);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      if (data.role !== undefined) user = service.updateRole(id, data.role);
      if (data.domainIds !== undefined) service.setDomains(id, data.domainIds);
      res.json(toDto(user));
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
